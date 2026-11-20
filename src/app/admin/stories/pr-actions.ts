"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { closeAdminPr } from "@/lib/admin/stories/close-pr";
import { isSlug } from "@/lib/admin/stories/store";

/**
 * «Закрити PR» (7c): застряглий PR адмінки (CI червоний, злиття не вийшло) блокує історію, а закрити його можна було лише на GitHub.
 * Публічний POST — requireAdmin() першим. З форми — адреса історії, номер PR і сторінка повернення; усе перевіряє closeAdminPr.
 */
export async function closePrAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  if (!isSlug(slug)) redirect("/admin/stories");
  const base = form.get("from") === "versions" ? `/admin/stories/${slug}/versions` : `/admin/stories/${slug}`;
  const raw = String(form.get("pr") ?? "");
  const number = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  const env = githubEnv();
  if (!number || !env) redirect(`${base}?r=${env ? "pr-bad" : "no-github"}`);
  const code = await closeAdminPr(new GitHub(env!), slug, number);
  redirect(`${base}?r=${code === "closed" ? "pr-closed" : code === "bad" ? "pr-bad" : "github"}&pr=${number}`);
}
