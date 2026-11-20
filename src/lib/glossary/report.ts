import { getStory, getStorySlugs } from "@/lib/stories/content";
import type { Inline } from "@/lib/stories/markdown";
import { getTerm } from "./terms";

/** Терміни, які авто-пошук позначив у вмісті: `id:фрагмент тексту`. */
const termsOf = (c: Inline[]): string[] => c.flatMap((x) => (x.t === "term" ? [`${x.id}:${x.v}`] : x.t === "b" || x.t === "i" ? termsOf(x.c) : []));

export type ReportRow = { slug: string; locale: "uk" | "en"; found: { id: string; text: string; known: boolean }[] };

/**
 * Звіт «що словник позначає в історіях» (замість знімка в CI, який червонів від будь-якої правки тексту).
 * Людина читає його, коли хоче перевірити нові терміни після правок: `npm run glossary:report [адреса-історії]`.
 */
export function glossaryReport(only?: string): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const slug of getStorySlugs().sort()) {
    if (only && slug !== only) continue;
    for (const locale of ["uk", "en"] as const) {
      const s = getStory(slug, locale);
      if (!s) continue;
      const found = s.blocks
        .flatMap((b) => (b.type === "p" ? termsOf(b.c) : b.type === "tldr" ? b.items.flatMap(termsOf) : b.type === "timeline" ? b.items.flatMap((it) => termsOf(it.c)) : []))
        .map((f) => {
          const i = f.indexOf(":");
          const id = f.slice(0, i);
          return { id, text: f.slice(i + 1), known: getTerm(id, locale) !== null };
        });
      rows.push({ slug, locale, found });
    }
  }
  return rows;
}

export function formatReport(rows: ReportRow[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const r of rows) {
    total += r.found.length;
    lines.push(`${r.slug} [${r.locale}] — ${r.found.length}`);
    for (const f of r.found) lines.push(`  ${f.known ? " " : "!"} ${f.id}  «${f.text}»${f.known ? "" : "  ← НЕМАЄ У СЛОВНИКУ"}`);
  }
  lines.push("", `Усього позначок: ${total}; історій: ${new Set(rows.map((r) => r.slug)).size}`);
  return lines.join("\n");
}
