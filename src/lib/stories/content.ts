import "server-only";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import circuitsJson from "@/data/curated/circuits.json";
import type { Locale } from "@/i18n/config";
import { markTerms } from "@/lib/glossary/mark";
import { getTerm, termMatchers, type Term } from "@/lib/glossary/terms";
import { countWords, parseStory, readingMinutes, type Block } from "./markdown";

/**
 * Історії (фаза 5): файли content/stories/<slug>/ (формат — content/stories/README.md) читаються під час збірки.
 * Сторінки статичні, тож читання з диска — лише на етапі `next build` (і в unit-тестах).
 */

export type Category = "scandal" | "sensation" | "history" | "explainer" | "tech";
export const CATEGORIES: Category[] = ["scandal", "sensation", "history", "explainer", "tech"];
export type Status = "ok" | "one" | "dis";
type L10n = { uk: string; en: string };

type RawSource = { id: string; title: string; publisher: string; date?: string; url: string; author?: string };
type RawClaim = { id: string; text: string; sources: string[]; status: Status; note?: string; label?: L10n; reader?: L10n };
type RawMedia = {
  id: string;
  role: "hero" | "inline";
  src: string;
  srcSet: string;
  width: number;
  height: number;
  focus?: string;
  credit: { page: string; author: string; license: string };
  caption: L10n;
  alt: L10n;
};
type RawStory = {
  slug: string;
  category: Category;
  years?: number[];
  title: L10n;
  dek: L10n;
  kicker?: L10n;
  featured?: boolean;
  race?: string;
  links?: { seasons?: number[]; races?: string[]; drivers?: string[]; teams?: string[]; circuits?: string[]; stories?: string[] };
  checked?: string;
  sources: RawSource[];
  claims: RawClaim[];
  media?: RawMedia[];
};

type Loaded = { raw: RawStory; md: Record<Locale, string> };

export type Meter = { total: number; ok: number; one: number; dis: number };
export type Photo = { id: string; src: string; srcSet: string; width: number; height: number; focus: string | null; caption: string; alt: string; credit: RawMedia["credit"] };

export type StoryCard = {
  slug: string;
  category: Category;
  kicker: string | null;
  year: number | null;
  /** Заголовок до першої «: » і після (другий рядок, акцент); без двокрапки — accent null. */
  title: { main: string; accent: string | null; full: string };
  dek: string;
  place: string | null;
  featured: boolean;
  minutes: number;
  meter: Meter;
  hero: Photo | null;
};

export type StoryClaim = { id: string; status: Status; sources: number[]; label: string | null; reader: string | null };
export type StorySource = { n: number; id: string; title: string; publisher: string; date: string | null; author: string | null; url: string };

export type StoryPage = StoryCard & {
  blocks: Block[];
  claims: Record<string, StoryClaim>;
  sources: StorySource[];
  media: Record<string, Photo>;
  disputes: StoryClaim[];
  toc: { id: string; text: string }[];
  race: { year: number; round: number } | null;
  links: NonNullable<RawStory["links"]>;
  checked: string | null;
  related: StoryCard[];
  /** Терміни словника, позначені в тексті (перша поява кожного) — для спливаючих підказок. */
  terms: Record<string, Term>;
};

const ROOT = join(process.cwd(), "content", "stories");
const places = (circuitsJson as unknown as { places: Record<string, { uk?: string; en?: string }> }).places;

let cache: Loaded[] | null = null;
function loadAll(): Loaded[] {
  if (cache) return cache;
  // Лише повні історії (story.json + обидві мови): повноту в репозиторії гарантує scripts/content/check_stories.py.
  const dirs = readdirSync(ROOT, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && ["story.json", "uk.md", "en.md"].every((f) => existsSync(join(ROOT, d.name, f))),
  );
  cache = dirs.map((d) => {
    const dir = join(ROOT, d.name);
    const raw = JSON.parse(readFileSync(join(dir, "story.json"), "utf8")) as RawStory;
    if (raw.slug !== d.name) throw new Error(`Історія ${d.name}: slug у story.json — «${raw.slug}»`);
    return { raw, md: { uk: readFileSync(join(dir, "uk.md"), "utf8"), en: readFileSync(join(dir, "en.md"), "utf8") } };
  });
  return cache;
}

export function splitTitle(title: string): StoryCard["title"] {
  const i = title.indexOf(": ");
  return i === -1 ? { main: title, accent: null, full: title } : { main: title.slice(0, i), accent: title.slice(i + 2), full: title };
}

function meterOf(claims: RawClaim[]): Meter {
  const m: Meter = { total: claims.length, ok: 0, one: 0, dis: 0 };
  for (const c of claims) m[c.status]++;
  return m;
}

function photo(m: RawMedia, locale: Locale): Photo {
  return { id: m.id, src: m.src, srcSet: m.srcSet, width: m.width, height: m.height, focus: m.focus ?? null, caption: m.caption[locale], alt: m.alt[locale], credit: m.credit };
}

/**
 * Рік і місце картки (рев'ю 15.11): історія про одну гонку — її рік і траса; скандал чи сенсація без гонки — перший рік
 * історії, без місця; огляди (історія, техніка, розбори) — без року й місця (інакше «Жінки у Ф1 — 1958 · Спа»).
 */
function yearOf(raw: RawStory): number | null {
  if (raw.race) return Number(raw.race.slice(0, 4));
  if ((raw.category === "scandal" || raw.category === "sensation") && raw.years?.length) return Math.min(...raw.years);
  return null;
}

function card({ raw, md }: Loaded, locale: Locale): StoryCard {
  const hero = raw.media?.find((m) => m.role === "hero");
  const circuit = raw.race ? raw.links?.circuits?.[0] : undefined;
  return {
    slug: raw.slug,
    category: raw.category,
    kicker: raw.kicker?.[locale] ?? null,
    year: yearOf(raw),
    title: splitTitle(raw.title[locale]),
    dek: raw.dek[locale],
    place: circuit ? (places[circuit]?.[locale] ?? null) : null,
    featured: raw.featured === true,
    minutes: readingMinutes(countWords(md[locale])),
    meter: meterOf(raw.claims),
    hero: hero ? photo(hero, locale) : null,
  };
}

/** Порядок списку: від нових років до старих; історії без року (розбори) — наприкінці, за заголовком. */
function byYear(a: StoryCard, b: StoryCard, locale: Locale): number {
  if (a.year !== null && b.year !== null && a.year !== b.year) return b.year - a.year;
  if ((a.year === null) !== (b.year === null)) return a.year === null ? 1 : -1;
  return a.title.main.localeCompare(b.title.main, locale);
}

/** Фото історій (з кредитами) — для зведеного переліку авторів на сторінці «Джерела й ліцензії». */
export function getStoryMedia(): { slug: string; media: RawMedia[] }[] {
  return loadAll().map((s) => ({ slug: s.raw.slug, media: s.raw.media ?? [] }));
}

export function getStorySlugs(): string[] {
  return loadAll().map((s) => s.raw.slug);
}

// Картки — один раз на мову за збірку (66 сторінок × метадані й сторінка інакше перераховували слова 33 історій).
const lists = new Map<Locale, StoryCard[]>();
export function getStoryList(locale: Locale): StoryCard[] {
  let list = lists.get(locale);
  if (!list) lists.set(locale, (list = loadAll().map((s) => card(s, locale)).sort((a, b) => byYear(a, b, locale))));
  return list;
}

/** Пов'язані: спершу з links.stories, далі — та сама рубрика за близькістю року, далі — будь-які за близькістю року. */
function related(self: Loaded, all: StoryCard[], n = 4): StoryCard[] {
  const out: StoryCard[] = [];
  const add = (c: StoryCard | undefined) => {
    if (c && c.slug !== self.raw.slug && !out.some((o) => o.slug === c.slug) && out.length < n) out.push(c);
  };
  for (const slug of self.raw.links?.stories ?? []) add(all.find((c) => c.slug === slug));
  const year = yearOf(self.raw) ?? (self.raw.years?.length ? Math.min(...self.raw.years) : null);
  const dist = (c: StoryCard) => (year === null || c.year === null ? 1000 : Math.abs(c.year - year));
  for (const c of [...all].filter((c) => c.category === self.raw.category).sort((a, b) => dist(a) - dist(b))) add(c);
  for (const c of [...all].sort((a, b) => dist(a) - dist(b))) add(c);
  return out;
}

export function getStory(slug: string, locale: Locale): StoryPage | null {
  const all = loadAll();
  const self = all.find((s) => s.raw.slug === slug);
  if (!self) return null;
  const { raw } = self;
  const num = new Map(raw.sources.map((s, i) => [s.id, i + 1]));
  const claims: Record<string, StoryClaim> = {};
  for (const c of raw.claims) {
    claims[c.id] = {
      id: c.id,
      status: c.status,
      sources: c.sources.map((s) => num.get(s)).filter((n): n is number => n !== undefined),
      label: c.label?.[locale] ?? null,
      reader: c.reader?.[locale] ?? null,
    };
  }
  const { blocks, used } = markTerms(parseStory(self.md[locale]), termMatchers(locale));
  const terms: Record<string, Term> = {};
  for (const id of used) {
    const t = getTerm(id, locale);
    if (!t) throw new Error(`Історія ${slug}: невідомий термін словника [[t:${id}|…]]`);
    terms[id] = t;
  }
  const toc = blocks.flatMap((b) => (b.type === "h2" ? [{ id: b.id, text: b.text }] : []));
  // Факти банера — лише коли історія про одну гонку і це явно вказано (race); links.races — просто посилання (Spygate ≠ Монако).
  const raceKey = raw.race;
  const rm = raceKey ? /^(\d{4})\/(\d{1,2})$/.exec(raceKey) : null;
  const cards = getStoryList(locale);
  return {
    ...card(self, locale),
    blocks,
    claims,
    sources: raw.sources.map((s, i) => ({ n: i + 1, id: s.id, title: s.title, publisher: s.publisher, date: s.date ?? null, author: s.author ?? null, url: s.url })),
    media: Object.fromEntries((raw.media ?? []).map((m) => [m.id, photo(m, locale)])),
    disputes: raw.claims.filter((c) => c.status === "dis").map((c) => claims[c.id]!),
    toc,
    race: rm ? { year: Number(rm[1]), round: Number(rm[2]) } : null,
    links: raw.links ?? {},
    checked: raw.checked ?? null,
    related: related(self, cards),
    terms,
  };
}
