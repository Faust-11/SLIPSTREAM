"use server";

import { redirect } from "next/navigation";
import { GitHub, GitHubError, RevertRefused, githubEnv, revertPublished } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { isSlug, openStoryPrs } from "@/lib/admin/stories/store";
import { loadVersion } from "@/lib/admin/stories/versions";

/**
 * Відкат правки історії (7c, задача 6). Публічний POST — requireAdmin() першим. З форми — лише адреса історії й номер PR;
 * PR має бути з журналу саме цієї історії (інакше кнопка на сторінці історії відкотила б довільну правку адмінки),
 * а відкритих PR цієї історії не має бути — як і при збереженні в редакторі. Далі — наявний revertPublished (7a):
 * він сам відмовить, якщо файли змінились після правки.
 */
export async function revertStoryAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  if (!isSlug(slug)) redirect("/admin/stories");
  const raw = String(form.get("pr") ?? "");
  const number = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  const back = (r: string, extra = ""): never => redirect(`/admin/stories/${slug}/versions?r=${r}${extra}`);
  const env = githubEnv();
  if (!number || !env) back(env ? "bad" : "no-github");
  const gh = new GitHub(env!);

  const version = await loadVersion(gh, slug, number).catch((e) => (e instanceof GitHubError && e.status === 404 ? null : undefined));
  if (version === undefined) back("github");
  if (version === null) back("bad");
  const open = await openStoryPrs(gh, slug).catch(() => null);
  if (!open) back("github");
  if (open!.length) back("open-pr");

  let created = 0;
  let code = "reverted";
  try {
    created = (await revertPublished(gh, number)).number;
  } catch (e) {
    code = e instanceof RevertRefused ? "refused" : "github";
  }
  back(code, created ? `&pr=${created}` : "");
}
