"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish } from "@/lib/admin/github";
import { acquireImage } from "@/lib/admin/photos/acquire";
import { focusString } from "@/lib/admin/photos/crop";
import { PhotoError, renderFormat } from "@/lib/admin/photos/render";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { MEDIA_ID, applyStoryPhoto, nextMediaId, roleFor } from "@/lib/admin/stories/media";
import { isSlug, openStoryPrs, readStory } from "@/lib/admin/stories/store";
import { validateStory } from "@/lib/admin/stories/validate";

/**
 * Фото історії (7c, задача 5): замінити hero чи будь-яке фото або додати inline-фото. Публічний POST — requireAdmin() першим.
 * З форми — лише вибір (див. photos/acquire.ts) і підписи; нарізка й запис у story.json — на сервері. Той самий захист,
 * що й у редакторі: немає відкритого PR цієї історії (гілка `admin/stories-<slug>-…`), результат проходить валідатор.
 */
const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function publishStoryPhotoAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("id") ?? "");
  if (!isSlug(slug)) redirect("/admin/stories");
  if (id !== "new" && !MEDIA_ID.test(id)) redirect(`/admin/stories/${slug}/photos`);
  const back = (r: string, extra = ""): never => redirect(`/admin/stories/${slug}/photos/${id}?r=${r}${extra}`);

  const caption = { uk: str(form, "caption_uk", 300), en: str(form, "caption_en", 300) };
  const alt = { uk: str(form, "alt_uk", 400), en: str(form, "alt_en", 400) };
  if (!caption.uk || !caption.en || !alt.uk || !alt.en) back("text");
  const env = githubEnv();
  if (!env) back("no-github");
  const gh = new GitHub(env!);

  // Читання й перевірка PR — окремо від redirect (він працює через виняток і не має потрапити в catch).
  const main = await readStory(gh, slug).catch(() => null);
  if (!main) back("github");
  const open = await openStoryPrs(gh, slug).catch(() => null);
  if (!open) back("github");
  if (open!.length) back("open-pr");
  const story = parseStoryJson(main!.files.json).story;
  const role = roleFor(story, id);
  if (!role) back("bad");

  const got = await acquireImage(form);
  if (!got.ok) back(got.code);
  const { bytes, credit, nc } = got as Extract<typeof got, { ok: true }>;

  // Точка фокусу (CSS object-position у story.json); порожнє чи сміття — центр.
  const pct = (k: string) => {
    const raw = str(form, k, 6);
    const n = raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : 0.5;
  };
  const focus = { x: pct("fx"), y: pct("fy") };
  const mediaId = id === "new" ? nextMediaId(story.media ?? []) : id;

  let applied: ReturnType<typeof applyStoryPhoto> | null = null;
  let failure: "too-small" | "render" | null = null;
  try {
    const variants = await renderFormat(bytes, role === "hero" ? "storyHero" : "storyInline", `/img/stories/${slug}/${mediaId}`, focus);
    applied = applyStoryPhoto(main!.files.json, slug, { id, variants, credit, focus: focusString(focus), caption, alt });
  } catch (e) {
    failure = e instanceof PhotoError ? "too-small" : "render";
  }
  if (!applied) back(failure ?? "render");
  const v = validateStory(slug, parseStoryJson(applied!.json).story, { uk: main!.files.uk, en: main!.files.en });
  if (v.errors.length) back("invalid");

  let number = 0;
  let failed = false;
  try {
    const what = id === "new" ? `нове фото ${applied!.id}` : role === "hero" ? "головне фото" : `фото ${applied!.id}`;
    const res = await publish(
      gh,
      {
        section: `stories-${slug}`,
        title: `Історія · ${slug}: ${what}`,
        body: [
          `Фото історії **${slug}** (${applied!.id}, ${role}): ${credit.page}`,
          `Автор: ${credit.author} · ліцензія: ${credit.license}${nc ? " — ⚠️ лише некомерційно (NC): замінити, якщо з'явиться реклама, підписка чи спонсор" : ""}.`,
        ].join("\n"),
        files: applied!.changes,
        draft: false,
      },
      undefined,
      main!.sha,
    );
    number = res.number;
  } catch {
    failed = true;
  }
  if (failed) back("github");
  back("published", `&pr=${number}`);
}
