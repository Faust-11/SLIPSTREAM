import "server-only";
import circuitLayoutsJson from "@/data/curated/circuit-layouts.json";
import circuitsJson from "@/data/curated/circuits.json";
import driverPortraitsJson from "@/data/curated/driver-portraits.json";
import curatedDriversJson from "@/data/curated/drivers.json";
import seasonsJson from "@/data/curated/seasons.json";
import teamsJson from "@/data/curated/teams.json";
import type { Locale } from "@/i18n/config";
import { getStoryList, getStoryMedia } from "@/lib/stories/content";
import { driverName, driverPortrait, loadDriverIndex } from "./drivers";

/**
 * Зведений перелік авторів фото сайту для сторінки «Джерела й ліцензії» (фаза 8): усі файли Wikimedia Commons з
 * кураторських даних (портрети, фото пілотів, команд, сезонів, трас, схеми трас) і з історій. Один файл — один рядок
 * (перша поява); підпис — що це на сайті (пілот, команда, сезон…), посилання — сторінка файлу в Commons.
 * Числа сторінки (файли, автори, ліцензії, схеми) рахуються звідси, а не пишуться в текст.
 */
export type CreditKind = "driver" | "team" | "season" | "circuit" | "layout" | "story";
/** alt — підпис іншою мовою (латиниця для uk): пошук «Hamilton» на /uk/sources. */
export type SiteCredit = { kind: CreditKind; label: string; alt: string | null; href: string; author: string; license: string };
type Credit = { page: string; author: string; license: string };

const isCredit = (x: unknown): x is Credit =>
  !!x && typeof x === "object" && typeof (x as Credit).page === "string" && typeof (x as Credit).author === "string" && typeof (x as Credit).license === "string";

/** Усі credit-вузли об'єкта (вкладені фото: photo.credit, hero.credit, manual.credit…). */
function creditsIn(x: unknown, out: Credit[] = []): Credit[] {
  if (isCredit(x)) out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => creditsIn(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => creditsIn(v, out));
  return out;
}

const isCommons = (c: Credit) => c.page.startsWith("https://commons.wikimedia.org/");

/** Автор з даних: подвоєння з розбору Commons («Unknown authorUnknown author») — один раз. */
export function cleanAuthor(a: string): string {
  const t = a.trim();
  const m = /^(.{3,}?)\1$/.exec(t);
  return m ? m[1]!.trim() : t;
}
/** Невідомий автор — не рахується серед «відомих авторів». */
export const isUnknownAuthor = (a: string) => /^(unknown|neznámý|unbekannt|anonym)/i.test(cleanAuthor(a));

export async function getSiteCredits(locale: Locale): Promise<SiteCredit[]> {
  const index = await loadDriverIndex();
  const byId = new Map(index.map((r) => [r.id, r]));
  const places = (circuitsJson as unknown as { places: Record<string, { uk?: string; en?: string }> }).places;
  const place = (id: string) => places[id]?.[locale] ?? id;
  const curated = (curatedDriversJson as unknown as { drivers: Record<string, { name: Record<Locale, string> }> }).drivers;
  const other: Locale = locale === "uk" ? "en" : "uk";
  const dname = (id: string, l: Locale = locale) => {
    const r = byId.get(id);
    return curated[id]?.name[l] ?? (r ? driverName(id, r.forename, r.surname, l) : id);
  };
  const placeAlt = (id: string) => places[id]?.[other] ?? null;

  const out: SiteCredit[] = [];
  const seen = new Set<string>();
  const add = (kind: CreditKind, label: string, node: unknown, alt: string | null = null) => {
    for (const c of creditsIn(node)) {
      if (!isCommons(c) || seen.has(c.page)) continue;
      seen.add(c.page);
      out.push({ kind, label, alt: alt && alt !== label ? alt : null, href: c.page, author: cleanAuthor(c.author), license: c.license });
    }
  };

  for (const [id, d] of Object.entries(curated)) add("driver", dname(id), d, dname(id, other));
  // Портрети — лише той, що сайт справді показує (driverPortrait: кураторський → ручний → макет), а не всі варіанти з
  // JSON: у Сенни є ручний портрет, і старий файл потрапляв у перелік, хоча на сайті його немає (рев'ю PR #47).
  for (const id of Object.keys((driverPortraitsJson as unknown as { drivers: Record<string, unknown> }).drivers)) {
    if (curated[id]) continue;
    const p = driverPortrait(id);
    if (p) add("driver", dname(id), p.credit, dname(id, other));
  }
  for (const t of (teamsJson as unknown as { teams: { name: string }[] }).teams) add("team", t.name, t);
  for (const [year, s] of Object.entries((seasonsJson as unknown as { seasons: Record<string, unknown> }).seasons)) add("season", year, s);
  for (const [id, p] of Object.entries(places)) add("circuit", place(id), p, placeAlt(id));
  for (const [id, l] of Object.entries((circuitLayoutsJson as unknown as { layouts: Record<string, unknown> }).layouts)) add("layout", place(id), l, placeAlt(id));
  const titles = new Map(getStoryList(locale).map((c) => [c.slug, c.title.full]));
  for (const { slug, media } of getStoryMedia()) add("story", titles.get(slug) ?? slug, media);

  const coll = new Intl.Collator(locale, { sensitivity: "base" });
  return out.sort((a, b) => coll.compare(a.label, b.label) || coll.compare(a.author, b.author));
}

/** Сімейство ліцензії для графіка: «CC BY-SA 3.0 nl» → «CC BY-SA 3.0»; рідкісні (< min файлів) — в «Інші». */
export function licenseFamily(license: string): string {
  return license.replace(/^(CC (?:BY(?:-SA)?|BY-NC(?:-SA)?) \d\.\d)\s+[a-z]{2}$/i, "$1").trim();
}

export function licenseCounts(items: { license: string }[], min = 15): { license: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(licenseFamily(it.license), (m.get(licenseFamily(it.license)) ?? 0) + 1);
  const big = [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const other = [...m.entries()].filter(([, n]) => n < min).reduce((s, [, n]) => s + n, 0);
  return [...big.map(([license, n]) => ({ license, n })), ...(other ? [{ license: "", n: other }] : [])];
}

/** Схеми трас за джерелом (circuit-layouts.json: f1-circuits — MIT/ODbL, commons — Wikimedia). */
export function layoutCounts(): { f1c: number; commons: number; total: number } {
  const layouts = Object.values((circuitLayoutsJson as unknown as { layouts: Record<string, { source?: string }> }).layouts);
  const f1c = layouts.filter((l) => l.source === "f1-circuits").length;
  const commons = layouts.filter((l) => l.source === "commons").length;
  return { f1c, commons, total: layouts.length };
}
