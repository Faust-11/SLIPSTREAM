import { createHash } from "node:crypto";

/**
 * «Застарілий переклад» (7c, задача 4). Оригінал — українська. У `story.json` поле `translated` зберігає хеші оригіналу на
 * момент, коли English-версію востаннє звірили з ним: заголовок, лід, kicker, вступ (текст до першого `##`) і кожен розділ
 * `##` за порядком. Українське змінилось → хеш не збігається → цей фрагмент English «застарів». Дати комітів не годяться:
 * будь-яка поправка коми в uk зробила б переклад «застарілим» (гіпотеза-альтернатива, відкинута в плані 7c).
 *
 * Файл самодостатній (лише `node:crypto`, типи — type-only): його імпортує і сторінка адмінки, і скрипт
 * `scripts/content/stamp_translation.mjs` (Node вміє читати .ts) — алгоритм хешування в одному місці.
 */
type L10nLike = { uk?: unknown; en?: unknown };
export type TranslationInput = { title?: L10nLike; dek?: L10nLike; kicker?: L10nLike; translated?: unknown };

export type Unit = { key: string; label: string; text: string };

export type TranslationStatus =
  /** Усі фрагменти оригіналу збігаються з відміткою. */
  | "ok"
  /** Є фрагменти, які змінились після відмітки (або з'явились нові, або розділів стало інакше). */
  | "stale"
  /** У story.json немає `translated` — звірку ніхто не відмічав. */
  | "unmarked";

export type TranslationCheck = {
  status: TranslationStatus;
  /** Фрагменти оригіналу, що змінились після відмітки або яких у відмітці немає. */
  stale: Unit[];
  /** Ключі з відмітки, яких в оригіналі вже немає (розділ видалено). */
  removed: string[];
  /** Кількість розділів `##` в uk і en різна — переклад не відповідає за структурою. */
  structure: { uk: number; en: number } | null;
};

const SECTION = /^##\s/;

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Пробіли й перенесення рядків не змінюють змісту: поправка відступу не має робити переклад «застарілим». */
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

export const hashUnit = (s: string): string => createHash("sha256").update(norm(s)).digest("hex").slice(0, 12);

/** Розділи markdown: вступ (до першого `##`, якщо непорожній) і кожен `##` разом із заголовком. */
export function splitSections(md: string): { key: string; label: string; text: string }[] {
  const lines = md.split(/\r\n|\r|\n/);
  const out: { key: string; label: string; text: string }[] = [];
  let cur: string[] = [];
  let n = 0;
  const flush = (heading: string | null) => {
    const body = cur.join("\n");
    if (heading === null) {
      if (norm(body)) out.push({ key: "intro", label: "Вступ (до першого розділу)", text: body });
    } else {
      out.push({ key: `sec${n}`, label: `Розділ ${n} «${heading}»`, text: body });
    }
  };
  let heading: string | null = null;
  for (const line of lines) {
    if (SECTION.test(line)) {
      flush(heading);
      n += 1;
      heading = line.replace(SECTION, "").trim();
      cur = [line];
    } else cur.push(line);
  }
  flush(heading);
  return out;
}

/** Фрагменти українського оригіналу, за якими стежимо. */
export function sourceUnits(story: TranslationInput, ukMd: string): Unit[] {
  const units: Unit[] = [
    { key: "title", label: "Заголовок", text: text(story.title?.uk) },
    { key: "dek", label: "Лід", text: text(story.dek?.uk) },
  ];
  if (text(story.kicker?.uk)) units.push({ key: "kicker", label: "Штамп (kicker)", text: text(story.kicker?.uk) });
  units.push(...splitSections(ukMd));
  return units;
}

/** Відмітка «переклад актуальний»: хеші всіх фрагментів оригіналу в порядку появи. */
export function stampTranslation(story: TranslationInput, ukMd: string): Record<string, string> {
  return Object.fromEntries(sourceUnits(story, ukMd).map((u) => [u.key, hashUnit(u.text)]));
}

const sectionCount = (md: string): number => splitSections(md).filter((s) => s.key !== "intro").length;

export function checkTranslation(story: TranslationInput, md: { uk: string; en: string }): TranslationCheck {
  const baseline = typeof story.translated === "object" && story.translated !== null && !Array.isArray(story.translated) ? (story.translated as Record<string, unknown>) : null;
  const structure = sectionCount(md.uk) === sectionCount(md.en) ? null : { uk: sectionCount(md.uk), en: sectionCount(md.en) };
  if (!baseline) return { status: "unmarked", stale: [], removed: [], structure };
  const units = sourceUnits(story, md.uk);
  const stale = units.filter((u) => baseline[u.key] !== hashUnit(u.text));
  const keys = new Set(units.map((u) => u.key));
  const removed = Object.keys(baseline).filter((k) => !keys.has(k));
  return { status: stale.length || removed.length || structure ? "stale" : "ok", stale, removed, structure };
}

/** Одним рядком — для списку й заголовків: «Розділ 2, Розділ 5». */
export const staleSummary = (c: TranslationCheck): string => {
  const parts = c.stale.map((u) => u.label);
  if (c.removed.length) parts.push(`видалено в оригіналі: ${c.removed.length}`);
  if (c.structure) parts.push(`розділів: uk ${c.structure.uk}, en ${c.structure.en}`);
  return parts.join("; ");
};
