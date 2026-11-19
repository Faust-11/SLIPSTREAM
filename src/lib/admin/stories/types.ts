/**
 * Формат історій для адмінки (фаза 7c) — те саме, що content/stories/README.md і src/lib/stories/content.ts, плюс поля,
 * яких сайт ще не знає (їх додає 7c): `status`, `translated`, `sources[].archive`. Чистий TypeScript без server-only —
 * ним користуються і сторінки адмінки, і unit-тести.
 */
export type L10n = { uk: string; en: string };
export type ClaimStatus = "ok" | "one" | "dis";
export type Lang = "uk" | "en";
export const LANGS: readonly Lang[] = ["uk", "en"];

export type StorySource = {
  id: string;
  title: string;
  publisher: string;
  date?: string;
  url: string;
  kind: "primary" | "secondary";
  lang: string;
  author?: string;
  /** Адреса копії в Web Archive (рішення користувача 19.11); показується читачам. */
  archive?: string;
};

export type StoryClaim = {
  id: string;
  text: string;
  sources: string[];
  status: ClaimStatus;
  note?: string;
  label?: L10n;
  reader?: L10n;
};

export type StoryJson = {
  slug: string;
  category: string;
  years?: number[];
  title: L10n;
  dek: L10n;
  kicker?: L10n;
  featured?: boolean;
  race?: string;
  /** `draft` — історії немає на сайті (рішення користувача 19.11); відсутнє поле = опубліковано. */
  status?: "draft";
  links?: Record<string, unknown>;
  checked?: string;
  /** Хеші оригіналу (uk) на момент перекладу — «застарілий переклад» (див. translation.ts). */
  translated?: Record<string, string>;
  sources: StorySource[];
  claims: StoryClaim[];
  media?: { id: string; [key: string]: unknown }[];
  blocks?: { id: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

/** Файли однієї історії: уміст як є (рядки) — адмінка пише їх байт-у-байт. */
export type StoryFiles = { json: string; uk: string; en: string };
