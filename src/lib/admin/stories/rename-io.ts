import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GitHub, GitHubError } from "../github";
import { parseStoryJson } from "./format";
import { REDIRECTS_PATH, photoDir, type RenameInput } from "./rename";
import { SLUG_RE, readStory, type OpenPr } from "./store";
import { prKind } from "./versions";

/**
 * Завантаження для зміни адреси (7c, задача 8): усе — з ОДНОГО коміту main (sha з readStory), щоб план не змішав стани.
 * Кандидати на «посилаються на цю історію» — з файлів збірки (одним проходом, без запитів) плюс історії, що з'явились у main
 * пізніше за збірку; самі файли кандидатів читаються з main.
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

/** Історії зі збірки, у яких `links.stories` містить адресу (дешево: файли вже в функції). */
function localReferrers(from: string): { slugs: string[]; all: string[] } {
  const root = join(process.cwd(), "content/stories");
  if (!existsSync(root)) return { slugs: [], all: [] };
  const all = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, "story.json"))).map((d) => d.name);
  const slugs = all.filter((s) => {
    if (s === from) return false;
    try {
      const list = parseStoryJson(readFileSync(join(root, s, "story.json"), "utf8")).story.links?.stories;
      return Array.isArray(list) && list.includes(from);
    } catch {
      return false;
    }
  });
  return { slugs, all };
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
  const local = localReferrers(from);
  const candidates = [...new Set([...local.slugs, ...existing.filter((s) => s !== from && !local.all.includes(s))])];
  const referrers: { slug: string; json: string }[] = [];
  for (const slug of candidates) {
    const f = await gh.request<{ content?: string; encoding?: string }>("GET", `/contents/${enc(`content/stories/${slug}/story.json`)}?ref=${sha}`);
    if (f.encoding === "base64" && f.content !== undefined) referrers.push({ slug, json: Buffer.from(f.content, "base64").toString("utf8") });
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

/** Відкриті PR адмінки, що чіпають будь-яку з цих історій (правка, фото, відкат): зміна адреси з ними зіткнулась би при злитті. */
export async function openConflicts(gh: GitHub, slugs: string[]): Promise<OpenPr[]> {
  const prs = await gh.request<{ number: number; title: string; draft?: boolean; html_url: string; head: { ref: string } }[]>("GET", "/pulls?state=open&per_page=100");
  return prs.filter((p) => slugs.some((s) => prKind(s, p) !== null)).map((p) => ({ number: p.number, title: p.title, draft: p.draft === true, url: p.html_url }));
}
