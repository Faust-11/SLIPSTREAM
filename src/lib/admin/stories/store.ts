import "server-only";
import { createHash } from "node:crypto";
import type { GitHub } from "../github";
import { readMain } from "../github";
import type { StoryFiles } from "./types";
import { prKind } from "./versions";

/** Адреса історії: латиниця, цифри, дефіси; гілка адмінки `admin/stories-<slug>-<час>` не довша за 64 знаки. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,55}$/;
export const isSlug = (v: unknown): v is string => typeof v === "string" && SLUG_RE.test(v);

export const storyPaths = (slug: string) => ({
  json: `content/stories/${slug}/story.json`,
  uk: `content/stories/${slug}/uk.md`,
  en: `content/stories/${slug}/en.md`,
});

/** Стан історії в main (рядки файлів як є) + коміт main, від якого рахуємо правку. */
export async function readStory(gh: GitHub, slug: string): Promise<{ sha: string; files: StoryFiles }> {
  const p = storyPaths(slug);
  const main = await readMain(gh, [p.json, p.uk, p.en]);
  return { sha: main.sha, files: { json: main.files[p.json]!, uk: main.files[p.uk]!, en: main.files[p.en]! } };
}

/** Відбиток файлів історії: форма запам'ятовує його при відкритті, дія звіряє з main (хтось інший змінив — не затираємо). */
export function hashFiles(f: StoryFiles): string {
  return createHash("sha256").update(f.json).update("\0").update(f.uk).update("\0").update(f.en).digest("hex").slice(0, 32);
}

export type OpenPr = { number: number; title: string; draft: boolean; url: string };

/**
 * Відкриті PR адмінки, що чіпають ці історії: за гілкою (`admin/stories-<slug>-…`, відкат) АБО за файлами (`content/stories/<slug>/`,
 * `public/img/stories/<slug>/`). Другий спосіб потрібен, бо PR зміни адреси А→Б править і story.json інших історій (`links.stories`), а
 * гілка в нього — за А: правка історії Х, що посилається на А, інакше створила б другий PR від тієї самої бази й зіткнулась би при злитті.
 * Файли запитуються лише в чужих PR адмінки (їх зазвичай 0–3).
 */
export async function openPrsTouching(gh: GitHub, slugs: string[], extraPaths: string[] = []): Promise<OpenPr[]> {
  const prs = await gh.request<{ number: number; title: string; draft?: boolean; html_url: string; head: { ref: string } }[]>("GET", "/pulls?state=open&per_page=100");
  const out: OpenPr[] = [];
  for (const p of prs) {
    let hit = slugs.some((s) => prKind(s, p) !== null);
    if (!hit && p.head.ref.startsWith("admin/")) {
      const files = await gh.request<{ filename: string }[]>("GET", `/pulls/${p.number}/files?per_page=100`);
      // 100 файлів — відповідь могла обрізатись: вважаємо, що чіпає (краще зайва пауза, ніж конфлікт при злитті).
      hit = files.length >= 100 || files.some((f) => extraPaths.includes(f.filename) || slugs.some((s) => f.filename.startsWith(`content/stories/${s}/`) || f.filename.startsWith(`public/img/stories/${s}/`)));
    }
    if (hit) out.push({ number: p.number, title: p.title, draft: p.draft === true, url: p.html_url });
  }
  return out;
}

/** Відкриті PR адмінки з правками саме цієї історії (див. openPrsTouching). */
export const openStoryPrs = (gh: GitHub, slug: string): Promise<OpenPr[]> => openPrsTouching(gh, [slug]);
