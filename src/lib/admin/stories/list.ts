import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseStoryJson } from "./format";
import type { StoryJson } from "./types";
import { validateStory } from "./validate";

/**
 * Список історій для адмінки (7c, задача 2): рядок на історію з тим, що потрібно, щоб вирішити «що перевірити першим» —
 * стан, розподіл тверджень, архів джерел, помилки валідації. Читає файли, що потрапили в збірку (outputFileTracingIncludes
 * для /admin/**); для редагування база — завжди main з GitHub (задача 3).
 */
export type StoryRow = {
  slug: string;
  /** Заголовок українською; для зламаного story.json — назва теки. */
  title: string;
  category: string;
  year: number | null;
  status: "draft" | "published";
  claims: { total: number; ok: number; one: number; dis: number };
  sources: number;
  /** Джерел, які варто архівувати (без API Jolpica), і скільки з них уже мають копію. */
  archivable: number;
  archived: number;
  words: { uk: number; en: number };
  errors: string[];
  warnings: string[];
};

export const FILTERS = ["all", "draft", "errors", "noarchive"] as const;
export type StoryFilter = (typeof FILTERS)[number];

export function parseFilter(value: string | undefined): StoryFilter {
  return (FILTERS as readonly string[]).includes(value ?? "") ? (value as StoryFilter) : "all";
}

/** JSON API Jolpica — наші дані, не стаття: архівувати нічого. */
const isArchivable = (url: string): boolean => {
  try {
    return new URL(url).hostname !== "api.jolpi.ca";
  } catch {
    return true;
  }
};

function yearOf(s: StoryJson): number | null {
  if (typeof s.race === "string" && /^\d{4}\//.test(s.race)) return Number(s.race.slice(0, 4));
  return s.years?.length ? Math.min(...s.years) : null;
}

/** Один рядок із файлів теки. Зламаний JSON не валить список — історія з'являється з помилкою (її видно й можна лагодити). */
export function readRow(root: string, slug: string): StoryRow {
  const read = (f: string): string | undefined => (existsSync(join(root, slug, f)) ? readFileSync(join(root, slug, f), "utf8") : undefined);
  const raw = read("story.json");
  const md = { uk: read("uk.md"), en: read("en.md") };
  const blank: StoryRow = {
    slug,
    title: slug,
    category: "?",
    year: null,
    status: "published",
    claims: { total: 0, ok: 0, one: 0, dis: 0 },
    sources: 0,
    archivable: 0,
    archived: 0,
    words: { uk: 0, en: 0 },
    errors: [],
    warnings: [],
  };
  if (raw === undefined) return { ...blank, errors: ["немає story.json"] };
  let story: StoryJson;
  try {
    story = parseStoryJson(raw).story;
  } catch (e) {
    return { ...blank, errors: [`story.json — невалідний JSON (${e instanceof Error ? e.message : "помилка"})`] };
  }
  const v = validateStory(slug, story, md);
  const sources = Array.isArray(story.sources) ? story.sources : [];
  const archivable = sources.filter((s) => isArchivable(String(s?.url ?? "")));
  return {
    slug,
    title: story.title?.uk || slug,
    category: String(story.category ?? "?"),
    year: yearOf(story),
    status: story.status === "draft" ? "draft" : "published",
    claims: { total: v.counts.ok + v.counts.one + v.counts.dis, ...v.counts },
    sources: sources.length,
    archivable: archivable.length,
    archived: archivable.filter((s) => typeof s?.archive === "string" && s.archive !== "").length,
    words: { uk: v.words.uk ?? 0, en: v.words.en ?? 0 },
    errors: v.errors,
    warnings: v.warnings,
  };
}

/** Порядок: чернетки першими (їх треба перевірити), далі з помилками, далі за адресою. */
export function sortRows(rows: StoryRow[]): StoryRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.status === "draft") - Number(a.status === "draft") || b.errors.length - a.errors.length || a.slug.localeCompare(b.slug),
  );
}

export function listStories(root = join(process.cwd(), "content/stories")): StoryRow[] {
  if (!existsSync(root)) return [];
  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  return sortRows(slugs.map((slug) => readRow(root, slug)));
}

const norm = (s: string): string => s.toLocaleLowerCase("uk").normalize("NFC");

export function matchesFilter(row: StoryRow, filter: StoryFilter): boolean {
  switch (filter) {
    case "draft":
      return row.status === "draft";
    case "errors":
      return row.errors.length > 0;
    case "noarchive":
      return row.archived < row.archivable;
    default:
      return true;
  }
}

/** Пошук — за адресою й заголовком, без регістру. */
export function filterRows(rows: StoryRow[], filter: StoryFilter, query: string): StoryRow[] {
  const q = norm(query.trim());
  return rows.filter((r) => matchesFilter(r, filter) && (!q || norm(r.slug).includes(q) || norm(r.title).includes(q)));
}

export function filterCounts(rows: StoryRow[]): Record<StoryFilter, number> {
  return Object.fromEntries(FILTERS.map((f) => [f, rows.filter((r) => matchesFilter(r, f)).length])) as Record<StoryFilter, number>;
}
