import termsJson from "../../../content/glossary/terms.json";
import type { Locale } from "@/i18n/config";

/**
 * Словник термінів (фаза 5b): одне джерело — content/glossary/terms.json (формат — content/glossary/README.md).
 * Використовують сторінка «Новачкам» (список з пошуком) і підказки в текстах історій та таблицях гонок.
 */

type L10nTerm = { term: string; def: string; forms: string[] };
type RawTerm = { id: string; auto: boolean; uk: L10nTerm; en: L10nTerm; orig: string; sources: string[] };
type RawSource = { id: string; title: string; publisher: string; date?: string; url: string; lang: string };
type RawGlossary = { checked: string; sources: RawSource[]; terms: RawTerm[] };

const RAW = termsJson as RawGlossary;

/** Термін для показу: назва мовою сторінки, оригінал (англійською — для uk), визначення. */
export type Term = { id: string; term: string; orig: string | null; def: string };
export type GlossarySource = { id: string; title: string; publisher: string; date: string | null; url: string; lang: string };

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function termOf(raw: RawTerm, locale: Locale): Term {
  const l = raw[locale];
  // Оригінал показуємо, лише коли він відрізняється від назви (en «Undercut» = оригінал → без дубля).
  const orig = raw.orig.replace(/[«»“”"]/g, "").toLowerCase() === l.term.replace(/[«»“”"]/g, "").toLowerCase() ? null : raw.orig;
  return { id: raw.id, term: l.term, orig, def: l.def };
}

const byLocale = new Map<Locale, Term[]>();
/** Усі терміни, відсортовані за абеткою мови (uk — українська абетка, латиниця після; en — англійська). */
export function getTerms(locale: Locale): Term[] {
  let list = byLocale.get(locale);
  if (!list) {
    const coll = new Intl.Collator(locale, { sensitivity: "base" });
    list = RAW.terms.map((t) => termOf(t, locale)).sort((a, b) => coll.compare(a.term.replace(/^[«“"]/, ""), b.term.replace(/^[«“"]/, "")));
    byLocale.set(locale, list);
  }
  return list;
}

export function getTerm(id: string, locale: Locale): Term | null {
  const raw = RAW.terms.find((t) => t.id === id);
  return raw ? termOf(raw, locale) : null;
}

export function glossaryChecked(): string {
  return RAW.checked;
}

export function glossarySources(): GlossarySource[] {
  return RAW.sources.map((s) => ({ id: s.id, title: s.title, publisher: s.publisher, date: s.date ?? null, url: s.url, lang: s.lang }));
}

export function isTermId(id: string): boolean {
  return ID_RE.test(id) && RAW.terms.some((t) => t.id === id);
}

/* ---------- пошук термінів у тексті ---------- */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Форма слова → регулярний вираз: `*` — до 5 літер закінчення («поул*» → поул, поулу, поулом), пробіл — будь-які пробіли.
 * Форма з великими літерами (DRS, VSC) — з урахуванням регістру; решта — без (перша літера речення).
 * Межі — не літера/цифра/апостроф/дефіс з обох боків: «поул*» не зачепить «поул-позицію» (для неї окрема форма).
 */
export function formSource(form: string): string {
  return form
    .split("*")
    .map((part) => part.split(/\s+/).map(escape).join("\\s+"))
    .join("\\p{L}{0,5}");
}

const B_BEFORE = "(?<![\\p{L}\\p{N}'’-])";
const B_AFTER = "(?![\\p{L}\\p{N}'’-])";

/** Два вирази на термін: без урахування регістру (звичайні слова) і з ним (абревіатури) — без RegExp-модифікаторів `(?-i:)`. */
export type Matcher = { id: string; res: RegExp[] };

const matchers = new Map<Locale, Matcher[]>();
/** Матчери автоматичних термінів мови (лише `auto: true`); довші форми — першими. */
export function termMatchers(locale: Locale): Matcher[] {
  let list = matchers.get(locale);
  if (!list) {
    list = RAW.terms
      .filter((t) => t.auto && t[locale].forms.length > 0)
      .map((t) => {
        const forms = [...t[locale].forms].sort((a, b) => b.length - a.length);
        const cs = forms.filter((f) => /\p{Lu}/u.test(f));
        const ci = forms.filter((f) => !/\p{Lu}/u.test(f));
        const re = (fs: string[], flags: string) => new RegExp(`${B_BEFORE}(?:${fs.map(formSource).join("|")})${B_AFTER}`, flags);
        return { id: t.id, res: [...(ci.length ? [re(ci, "iu")] : []), ...(cs.length ? [re(cs, "u")] : [])] };
      });
    matchers.set(locale, list);
  }
  return list;
}

/**
 * Найраніший збіг серед усіх термінів (за рівного початку — довший). Уже використані теж шукаємо: їхній фрагмент
 * «поглинається» без підказки — інакше «машина безпеки» спливала б усередині другої «віртуальної машини безпеки».
 */
export function firstMatch(text: string, ms: Matcher[], used: Set<string>): { id: string; index: number; length: number; used: boolean } | null {
  let best: { id: string; index: number; length: number; used: boolean } | null = null;
  for (const m of ms) {
    for (const re of m.res) {
      const r = re.exec(text);
      if (r && (!best || r.index < best.index || (r.index === best.index && r[0].length > best.length)))
        best = { id: m.id, index: r.index, length: r[0].length, used: used.has(m.id) };
    }
  }
  return best;
}
