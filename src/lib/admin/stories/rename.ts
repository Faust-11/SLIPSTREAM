import type { FileChange } from "../github";
import { parseStoryJson, serializeStoryJson } from "./format";
import type { StoryFiles } from "./types";
import { validateStory } from "./validate";

/**
 * Зміна адреси історії (7c, задача 8) — план змін для ОДНОГО PR. Чиста функція: усе, що треба з мережі (файли з main, перелік фото,
 * інші історії, редиректи), приходить аргументом; тут — лише рішення й нові вмісти файлів (тестується без GitHub).
 *
 * Що змінюється: тека історії (3 файли), `slug` і шляхи фото в story.json, файли фото (перейменування — той самий blob, без
 * перезавантаження), `links.stories` в інших історіях (37 перехресних посилань на 19.11), запис у story-redirects.json (старий
 * шлях веде на новий; ланцюжки стискаються). Чого не змінює і чому блокує: адреси, прописані в КОДІ (головна, Lighthouse) —
 * їх міняє лише кодовий PR.
 */
export const CODE_PINNED: Record<string, string> = {
  "suzuka-1989": "головна сторінка (src/app/[lang]/page.tsx)",
  "jerez-1997": "головна сторінка (src/app/[lang]/page.tsx)",
  "singapore-2008": "головна сторінка і перевірка Lighthouse (src/app/[lang]/page.tsx, scripts/lighthouse*.mjs)",
};

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,55}$/;
export const REDIRECTS_PATH = "src/data/curated/story-redirects.json";
export const photoDir = (slug: string): string => `public/img/stories/${slug}`;
const storyPath = (slug: string, file: "story.json" | "uk.md" | "en.md"): string => `content/stories/${slug}/${file}`;

export type RenameInput = {
  from: string;
  to: string;
  files: StoryFiles;
  /** Файли `public/img/stories/<from>/` у main: назва й sha blob. */
  photos: { name: string; sha: string }[];
  /** story.json інших історій з main, які можуть посилатись на `from` (перелік відбирає завантажувач). */
  referrers: { slug: string; json: string }[];
  /** Усі адреси історій у main. */
  existing: string[];
  redirects: Record<string, string>;
  pinned?: Record<string, string>;
};

export type RenamePlan =
  | {
      ok: true;
      changes: FileChange[];
      summary: { photos: number; linkedStories: string[]; mediaRewritten: number; redirects: number };
    }
  | { ok: false; errors: string[] };

/** Перевірка нової адреси без файлів (для швидкої відповіді у формі). */
export function checkNewSlug(from: string, to: string, existing: string[], redirects: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!SLUG_RE.test(to)) errors.push("Адреса: лише малі латинські літери, цифри й дефіс, до 56 знаків, починається з літери чи цифри.");
  else {
    if (to === from) errors.push("Нова адреса збігається зі старою.");
    if (existing.includes(to)) errors.push(`Адреса «${to}» уже є в іншої історії.`);
    if (Object.hasOwn(redirects, to)) errors.push(`Адреса «${to}» раніше вела на іншу історію (є редирект) — використати її знову не можна.`);
  }
  return errors;
}

const swap = (s: string, from: string, to: string): string => s.split(`/img/stories/${from}/`).join(`/img/stories/${to}/`);

export function planRename(input: RenameInput): RenamePlan {
  const { from, to, files, photos, referrers, existing, redirects } = input;
  const pinned = input.pinned ?? CODE_PINNED;
  const errors = checkNewSlug(from, to, existing, redirects);
  if (!existing.includes(from)) errors.push(`Історії «${from}» немає.`);
  if (pinned[from]) errors.push(`Адреса «${from}» прописана в коді: ${pinned[from]}. Спершу кодовий PR, тоді зміна адреси.`);
  if (errors.length) return { ok: false, errors };

  // story.json цієї історії: slug і шляхи фото.
  const { story, trailingNewline } = parseStoryJson(files.json);
  story.slug = to;
  let mediaRewritten = 0;
  for (const m of story.media ?? []) {
    for (const key of ["src", "srcSet"]) {
      const v = m[key];
      if (typeof v === "string" && v.includes(`/img/stories/${from}/`)) {
        m[key] = swap(v, from, to);
        mediaRewritten += 1;
      }
    }
  }
  const json = serializeStoryJson(story, trailingNewline);
  const v = validateStory(to, parseStoryJson(json).story, { uk: files.uk, en: files.en });
  if (v.errors.length) return { ok: false, errors: ["Після зміни історія не проходить перевірку:", ...v.errors] };

  const changes: FileChange[] = [
    { path: storyPath(from, "story.json"), content: null },
    { path: storyPath(from, "uk.md"), content: null },
    { path: storyPath(from, "en.md"), content: null },
    { path: storyPath(to, "story.json"), content: json },
    { path: storyPath(to, "uk.md"), content: files.uk },
    { path: storyPath(to, "en.md"), content: files.en },
  ];
  for (const p of photos) {
    changes.push({ path: `${photoDir(from)}/${p.name}`, content: null });
    changes.push({ path: `${photoDir(to)}/${p.name}`, sha: p.sha });
  }

  // Інші історії: links.stories.
  const linkedStories: string[] = [];
  for (const r of referrers) {
    if (r.slug === from) continue;
    const parsed = parseStoryJson(r.json);
    const list = parsed.story.links?.stories;
    if (!Array.isArray(list) || !list.includes(from)) continue;
    parsed.story.links = { ...parsed.story.links, stories: list.map((s) => (s === from ? to : s)) };
    changes.push({ path: storyPath(r.slug, "story.json"), content: serializeStoryJson(parsed.story, parsed.trailingNewline) });
    linkedStories.push(r.slug);
  }

  // Редиректи: старі ланцюжки (x → from) тепер ведуть одразу на нову адресу.
  const next: Record<string, string> = {};
  for (const [a, b] of Object.entries(redirects)) next[a] = b === from ? to : b;
  next[from] = to;
  const sorted = Object.fromEntries(Object.entries(next).sort(([x], [y]) => x.localeCompare(y)));
  changes.push({ path: REDIRECTS_PATH, content: `${JSON.stringify(sorted, null, 2)}\n` });

  return { ok: true, changes, summary: { photos: photos.length, linkedStories, mediaRewritten, redirects: Object.keys(sorted).length } };
}
