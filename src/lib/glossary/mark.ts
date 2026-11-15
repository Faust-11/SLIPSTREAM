import type { Locale } from "@/i18n/config";
import { parseInline, type Block, type Inline } from "@/lib/stories/markdown";
import { firstMatch, getTerm, termMatchers, type Matcher, type Term } from "./terms";

/**
 * Автоматичні підказки в тексті історії (рішення 15.11: «авто + винятки»): кожен термін — лише перша поява на сторінці.
 * Ручні мітки `[[t:id|…]]` теж рахуються як поява (далі автоматично цей термін не позначається).
 * Не чіпаємо заголовки глав і цитати (чужі слова), позначаємо абзаци, «Коротко» й хронологію; вкладені жирний/курсив — теж.
 */
export function markTerms(blocks: Block[], ms: Matcher[]): { blocks: Block[]; used: string[] } {
  const used = new Set<string>();
  // Спершу ручні мітки — щоб автоматична поява раніше в тексті не «з'їла» термін, який автор позначив свідомо, і не дублювала його.
  const collect = (c: Inline[]) => {
    for (const x of c) {
      if (x.t === "term") used.add(x.id);
      else if (x.t === "b" || x.t === "i") collect(x.c);
    }
  };
  for (const b of blocks) {
    if (b.type === "p") collect(b.c);
    else if (b.type === "tldr") b.items.forEach(collect);
    else if (b.type === "timeline") b.items.forEach((it) => collect(it.c));
  }
  const order: string[] = [];

  const mark = (c: Inline[]): Inline[] =>
    c.flatMap((x): Inline[] => {
      if (x.t === "b" || x.t === "i") return [{ ...x, c: mark(x.c) }];
      if (x.t === "term") {
        // Ручна мітка — завжди підказка, але лише перша для свого id.
        if (order.includes(x.id)) return [{ t: "text", v: x.v }];
        order.push(x.id);
        return [x];
      }
      if (x.t !== "text") return [x];
      const out: Inline[] = [];
      let rest = x.v;
      for (;;) {
        const m = firstMatch(rest, ms, used);
        if (!m) break;
        const end = m.index + m.length;
        if (m.used) {
          out.push({ t: "text", v: rest.slice(0, end) });
        } else {
          if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
          out.push({ t: "term", id: m.id, v: rest.slice(m.index, end) });
          used.add(m.id);
          order.push(m.id);
        }
        rest = rest.slice(end);
      }
      if (rest) out.push({ t: "text", v: rest });
      return out;
    });

  const result = blocks.map((b): Block => {
    if (b.type === "p") return { ...b, c: mark(b.c) };
    if (b.type === "tldr") return { ...b, items: b.items.map(mark) };
    if (b.type === "timeline") return { ...b, items: b.items.map((it) => ({ ...it, c: mark(it.c) })) };
    return b;
  });
  return { blocks: result, used: order };
}

/**
 * Рядки сторінки (у порядку показу) → інлайн-дерева з підказками: кожен термін — перша поява на всій сторінці.
 * Порядок ключів = порядок на сторінці (від нього залежить, де саме спливе підказка).
 */
export function markStrings(entries: [key: string, text: string][], locale: Locale): { text: Record<string, Inline[]>; terms: Record<string, Term> } {
  const { blocks, used } = markTerms(
    entries.map(([, v]) => ({ type: "p", c: parseInline(v) })),
    termMatchers(locale),
  );
  const text: Record<string, Inline[]> = {};
  entries.forEach(([k], i) => {
    const b = blocks[i]!;
    text[k] = b.type === "p" ? b.c : [];
  });
  const terms: Record<string, Term> = {};
  for (const id of used) {
    const t = getTerm(id, locale);
    if (t) terms[id] = t;
  }
  return { text, terms };
}
