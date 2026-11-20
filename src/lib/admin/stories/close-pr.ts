import "server-only";
import { ADMIN_LABEL, GitHubError, type GitHub } from "../github";
import { openStoryPrs } from "./store";

export type CloseResult = "closed" | "bad" | "github";

/**
 * Закриття застряглого PR адмінки без злиття (7c). Закрити можна лише PR, який одночасно: у списку відкритих PR цієї історії
 * (форма не закриє довільний номер), має мітку `admin`, гілку `admin/…` і ще відкритий. Гілку не видаляємо: закритий PR
 * можна знову відкрити на GitHub, нічого не втрачено.
 */
export async function closeAdminPr(gh: GitHub, slug: string, number: number): Promise<CloseResult> {
  try {
    const open = await openStoryPrs(gh, slug);
    if (!open.some((p) => p.number === number)) return "bad";
    const pr = await gh.request<{ state: string; merged_at?: string | null; head: { ref: string }; labels: { name: string }[] }>("GET", `/pulls/${number}`);
    if (pr.state !== "open" || pr.merged_at || !pr.head.ref.startsWith("admin/") || !pr.labels.some((l) => l.name === ADMIN_LABEL)) return "bad";
    await gh.request("PATCH", `/pulls/${number}`, { state: "closed" });
    return "closed";
  } catch (e) {
    return e instanceof GitHubError && e.status === 404 ? "bad" : "github";
  }
}
