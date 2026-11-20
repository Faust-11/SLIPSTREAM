"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { planRename } from "@/lib/admin/stories/rename";
import { loadRenameInput, openConflicts } from "@/lib/admin/stories/rename-io";
import { isSlug } from "@/lib/admin/stories/store";

/**
 * Зміна адреси історії (7c, задача 8). Публічний POST — requireAdmin() першим. З форми — лише стара й нова адреса; усе інше
 * (файли, фото, посилання, редиректи) сервер бере з main і рахує заново: попередній перегляд на сторінці — зручність, не довіра.
 * Гілка `admin/stories-<стара>-…`: поки PR відкритий, стара адреса заблокована для будь-яких інших правок (як і в редакторі).
 */
export async function renameStoryAction(form: FormData): Promise<void> {
  await requireAdmin();
  const from = String(form.get("slug") ?? "");
  const to = String(form.get("to") ?? "").trim().slice(0, 80);
  if (!isSlug(from)) redirect("/admin/stories");
  const back = (r: string, extra = ""): never => redirect(`/admin/stories/${from}/address?r=${r}${extra}`);
  const env = githubEnv();
  if (!env) back("no-github");
  const gh = new GitHub(env!);

  const loaded = await loadRenameInput(gh, from, to).catch(() => undefined);
  if (loaded === undefined) back("github");
  if (loaded === null) back("bad");
  const plan = planRename(loaded!.input);
  if (!plan.ok) back("invalid", `&to=${encodeURIComponent(to)}`);
  const ok = plan as Extract<typeof plan, { ok: true }>;
  const conflicts = await openConflicts(gh, [from, ...ok.summary.linkedStories]).catch(() => null);
  if (!conflicts) back("github");
  if (conflicts!.length) back("open-pr", `&to=${encodeURIComponent(to)}`);

  let number = 0;
  let failed = false;
  try {
    const res = await publish(
      gh,
      {
        section: `stories-${from}`,
        title: `Історія · ${from}: адреса змінена на ${to}`,
        body: [
          `Адреса історії **${from}** → **${to}**.`,
          `Файли: тека історії (3), фото: ${ok.summary.photos}, посилання в інших історіях: ${ok.summary.linkedStories.join(", ") || "немає"}.`,
          `Старі адреси /stories/${from} і /uk/stories/${from} постійно перенаправляються (src/data/curated/story-redirects.json).`,
        ].join("\n"),
        files: ok.changes,
        draft: false,
      },
      undefined,
      loaded!.sha,
    );
    number = res.number;
  } catch {
    failed = true;
  }
  if (failed) back("github");
  back("published", `&pr=${number}&to=${encodeURIComponent(to)}`);
}
