"use server";

import { GitHub, githubEnv, publish } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { applyFields, describeChanges, type Fields } from "@/lib/admin/stories/form";
import { pinnedDraftError } from "@/lib/admin/stories/pinned";
import { hashFiles, isSlug, openStoryPrs, readStory, storyPaths } from "@/lib/admin/stories/store";
import { validateStory } from "@/lib/admin/stories/validate";

export type SaveState =
  | { status: "idle" }
  | { status: "error"; nonce: number; errors: string[]; fields: Fields }
  | { status: "saved"; nonce: number; pr: number; url: string; changes: string[]; warnings: string[]; fields: Fields };

/** Лише поля форми редактора (React додає службові `$ACTION_*`); довжина кожного обмежена. */
const FIELD = /^(title_|dek_|kicker_|md_)(uk|en)$|^(checked|status|claims|sources|translated_ok)$|^c\.\d+\.[a-z_]+$|^s\.\d+\.[a-z_]+$/;
const MAX_FIELD = 400_000;
const MAX_FIELDS = 5000;

function collect(form: FormData): Fields | null {
  const out: Fields = {};
  let n = 0;
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" || !FIELD.test(k)) continue;
    if (++n > MAX_FIELDS || v.length > MAX_FIELD) return null;
    out[k] = v;
  }
  return out;
}

/**
 * Публікація правок історії (7c): PR із `main` → CI → автозлиття (admin-merge.yml). Публічний POST — requireAdmin() першим.
 * Перед PR: файли в main ті самі, що були при відкритті форми (`orig`); немає іншого відкритого PR цієї історії; результат
 * проходить TS-валідатор (ті самі правила, що check_stories.py у CI). Помилка — відповідь зі значеннями форми, нічого не втрачається.
 */
export async function saveStoryAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  await requireAdmin();
  const nonce = Date.now();
  const fields = collect(form) ?? {};
  const fail = (...errors: string[]): SaveState => ({ status: "error", nonce, errors, fields });
  const slug = form.get("slug");
  if (!isSlug(slug) || Object.keys(fields).length === 0) return fail("Некоректний запит.");
  const env = githubEnv();
  if (!env) return fail("GitHub не підключено — публікація неможлива (див. «Система»).");
  const gh = new GitHub(env);

  let main;
  try {
    main = await readStory(gh, slug);
  } catch {
    return fail("Не вдалося прочитати історію з GitHub. Спробуйте пізніше.");
  }
  if (hashFiles(main.files) !== String(form.get("orig") ?? "")) {
    return fail("Історія змінилась у репозиторії, поки відкрита ця сторінка (хтось злив іншу правку). Оновіть сторінку; свої зміни скопіюйте з форми — вона збережена нижче.");
  }
  try {
    const open = await openStoryPrs(gh, slug);
    if (open.length) return fail(`Правки цієї історії вже чекають злиття: PR #${open.map((p) => p.number).join(", #")}. Дочекайтеся злиття (або закрийте PR) і відкрийте історію знову.`);
  } catch {
    return fail("Не вдалося перевірити відкриті PR. Спробуйте пізніше.");
  }

  const applied = applyFields(main.files, fields);
  if (!applied.changed) return fail("Немає змін.");
  const pinned = pinnedDraftError(slug, applied.story.status);
  if (pinned) return fail(pinned);
  const v = validateStory(slug, applied.story, { uk: applied.files.uk, en: applied.files.en });
  if (v.errors.length) return fail(...v.errors);

  const changes = describeChanges(main.files, applied);
  const p = storyPaths(slug);
  const files = (
    [
      [p.json, main.files.json, applied.files.json],
      [p.uk, main.files.uk, applied.files.uk],
      [p.en, main.files.en, applied.files.en],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([path, , after]) => ({ path, content: after }));
  try {
    const pr = await publish(
      gh,
      {
        section: `stories-${slug}`,
        title: `Історія · ${slug}: ${changes.join(", ")}`.slice(0, 120),
        body: `Правки історії **${slug}** з адмінки: ${changes.join("; ")}.${v.warnings.length ? `\n\nПопередження валідатора:\n${v.warnings.map((w) => `- ${w}`).join("\n")}` : ""}`,
        files,
        draft: false,
      },
      undefined,
      main.sha,
    );
    return { status: "saved", nonce, pr: pr.number, url: pr.url, changes, warnings: v.warnings, fields };
  } catch {
    return fail("GitHub не прийняв правку. Спробуйте пізніше.");
  }
}
