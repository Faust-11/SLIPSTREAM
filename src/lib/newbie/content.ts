import en from "../../../content/newbie/en.json";
import pageJson from "../../../content/newbie/page.json";
import uk from "../../../content/newbie/uk.json";
import type { Locale } from "@/i18n/config";

/**
 * Тексти сторінки «Новачкам» (фаза 5b) — власні файли content/newbie/, а не спільні словники сайту (інші діалоги правлять
 * uk.json/en.json паралельно). Формат і правила джерел — content/newbie/README.md; перевірка — scripts/content/check_glossary.py.
 */
export type NewbieText = typeof uk;
export type SectionKey = "basics" | "weekend" | "points" | "tyres" | "flags" | "overtake" | "glossary";
export const SECTIONS: SectionKey[] = ["basics", "weekend", "points", "tyres", "flags", "overtake", "glossary"];

type RawSource = { id: string; title: string; publisher: string; date?: string; url: string; kind: "primary" | "secondary"; lang: string; author?: string; ref?: string };
type RawClaim = { id: string; section: SectionKey; text: string; sources: string[]; status: "ok" | "one" };
type RawPage = { checked: string; sources: RawSource[]; claims: RawClaim[] };

const TEXT = { uk, en } satisfies Record<Locale, NewbieText>;
const PAGE = pageJson as RawPage;

export function newbieText(locale: Locale): NewbieText {
  return TEXT[locale];
}

export type SectionSource = { id: string; title: string; publisher: string; url: string; ref: string | null; lang: string };

/** Джерела розділу (рішення 15.11: рядок під розділом) — усі джерела тверджень розділу, у порядку першої появи. */
export function sectionSources(section: SectionKey): SectionSource[] {
  const ids: string[] = [];
  for (const c of PAGE.claims) if (c.section === section) for (const s of c.sources) if (!ids.includes(s)) ids.push(s);
  return ids.map((id) => {
    const s = PAGE.sources.find((x) => x.id === id);
    if (!s) throw new Error(`content/newbie/page.json: невідоме джерело ${id}`);
    return { id: s.id, title: s.title, publisher: s.publisher, url: s.url, ref: s.ref ?? null, lang: s.lang };
  });
}

export function newbieChecked(): string {
  return PAGE.checked;
}
