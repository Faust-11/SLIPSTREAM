import "server-only";
import { GitHub, GitHubError } from "../github";
import { REDIRECTS_PATH, photoDir, type RenameInput } from "./rename";
import { SLUG_RE, readStory } from "./store";

/**
 * Завантаження для зміни адреси (7c, задача 8): усе — з ОДНОГО коміту main (sha з readStory), щоб план не змішав стани.
 * Посилання `links.stories` шукаємо в УСІХ історіях main (≈33 запити пачками по 8).
 */
const enc = (p: string): string => p.split("/").map(encodeURIComponent).join("/");

type Entry = { name: string; type: string; sha: string };

async function listDir(gh: GitHub, path: string, ref: string): Promise<Entry[]> {
  try {
    return await gh.request<Entry[]>("GET", `/contents/${enc(path)}?ref=${ref}`);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return [];
    throw e;
  }
}

export async function loadRenameInput(gh: GitHub, from: string, to: string): Promise<{ input: RenameInput; sha: string } | null> {
  if (!SLUG_RE.test(from)) return null;
  let story;
  try {
    story = await readStory(gh, from);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
  const { sha } = story;
  const [dirs, photoList, redirectsFile] = await Promise.all([
    listDir(gh, "content/stories", sha),
    listDir(gh, photoDir(from), sha),
    gh.request<{ content?: string }>("GET", `/contents/${enc(REDIRECTS_PATH)}?ref=${sha}`).catch((e) => {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }),
  ]);
  const existing = dirs.filter((d) => d.type === "dir").map((d) => d.name);
  // Усі інші історії — з main на тому самому коміті (не зі збірки: вона може відставати, а історію могли видалити чи дописати в неї посилання).
  const referrers: { slug: string; json: string }[] = [];
  const others = existing.filter((s) => s !== from);
  for (let i = 0; i < others.length; i += 8) {
    const batch = await Promise.all(
      others.slice(i, i + 8).map(async (slug) => {
        const f = await gh.request<{ content?: string; encoding?: string }>("GET", `/contents/${enc(`content/stories/${slug}/story.json`)}?ref=${sha}`).catch((e) => {
          if (e instanceof GitHubError && e.status === 404) return null; // тека без story.json — не історія
          throw e;
        });
        return f && f.encoding === "base64" && f.content !== undefined ? { slug, json: Buffer.from(f.content, "base64").toString("utf8") } : null;
      }),
    );
    for (const b of batch) if (b) referrers.push(b);
  }
  let redirects: Record<string, string> = {};
  if (redirectsFile?.content) {
    try {
      const parsed = JSON.parse(Buffer.from(redirectsFile.content, "base64").toString("utf8")) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) redirects = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      /* зіпсований файл — як порожній: тест у CI його все одно не пропустить */
    }
  }
  return {
    sha,
    input: {
      from,
      to,
      files: story.files,
      photos: photoList.filter((e) => e.type === "file" && e.name.endsWith(".webp")).map((e) => ({ name: e.name, sha: e.sha })),
      referrers,
      existing,
      redirects,
    },
  };
}
