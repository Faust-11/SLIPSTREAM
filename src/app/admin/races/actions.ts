"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish, readMain } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { VIDEOS_PATH, applyVideo, checkOfficial, youtubeId } from "@/lib/admin/video";

/** Хайлайт гонки: поставити (перевірка офіційного каналу) або прибрати. Публічний POST — requireAdmin() першим. */
export async function setVideoAction(form: FormData): Promise<void> {
  await requireAdmin();
  const key = String(form.get("key") ?? "");
  const back = (r: string, extra = "") => redirect(`/admin/races?r=${r}&k=${encodeURIComponent(key)}${extra}`);
  if (!/^\d{4}\/\d{1,2}$/.test(key)) redirect("/admin/races?r=bad");
  const env = githubEnv();
  if (!env) back("no-github");
  const remove = form.get("remove") === "1";
  let video = null;
  if (!remove) {
    const id = youtubeId(String(form.get("link") ?? ""));
    if (!id) back("link");
    const check = await checkOfficial(id!);
    if (!check.ok) back("not-official");
    video = check.ok ? check.video : null;
  }
  let number = 0;
  try {
    const gh = new GitHub(env!);
    const current = (await readMain(gh, [VIDEOS_PATH]))[VIDEOS_PATH]!;
    const res = await publish(gh, {
      section: "video",
      title: remove ? `Хайлайт · ${key} — прибрано` : `Хайлайт · ${key}: ${video!.title}`,
      body: remove ? `Відео гонки ${key} прибрано зі сторінки.` : `https://www.youtube.com/watch?v=${video!.id} — офіційний канал FORMULA 1 (перевірено oEmbed).`,
      files: [{ path: VIDEOS_PATH, content: applyVideo(current, key, video) }],
      draft: false,
    });
    number = res.number;
  } catch {
    back("github");
  }
  back(remove ? "removed" : "published", `&pr=${number}`);
}
