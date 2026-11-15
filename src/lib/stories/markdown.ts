/**
 * Розбирач тексту історій (content/stories/<slug>/{uk,en}.md) — лише підмножина формату README:
 * абзаци, `## ` глави, цитати `>` (1 рядок, або оригінал + переклад + `— хто · контекст`), `**жирний**`, `*курсив*`,
 * виноски `[^cN]`, фото `[[media:mN]]`, віджети `[[block:bN]]`, блоки `:::tldr` і `:::timeline`.
 * Результат — дерево даних; React-елементи будує сторінка (без сирого HTML — нічого не потрапляє в розмітку як є).
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "fn"; claim: string };

export type Block =
  | { type: "h2"; id: string; text: string }
  | { type: "p"; c: Inline[] }
  | { type: "quote"; orig: Inline[]; tr: Inline[] | null; cite: string | null }
  | { type: "media"; id: string }
  | { type: "widget"; id: string }
  | { type: "tldr"; items: Inline[][] }
  | { type: "timeline"; items: { date: string; c: Inline[] }[] };

const FN = /\[\^(c\d+)\]/g;

/** Інлайн-розмітка: виноски, **жирний**, *курсив* (вкладеність — лише виноски всередині виділення). */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])|\[\^(c\d+)\]/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", c: parseFootnotes(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "i", c: parseFootnotes(m[2]) });
    else out.push({ t: "fn", claim: m[3]! });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

function parseFootnotes(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(FN)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    out.push({ t: "fn", claim: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

/** Ідентифікатор глави з заголовка: латиниця й кирилиця, дефіси; повтори — з номером. */
export function slugify(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[«»"“”'’.,:;!?()…—–]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "ch";
  let id = /^(s\d+|story-.*)$/.test(base) ? `ch-${base}` : base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

/** Ідентифікатори, які сторінка історії вже займає (розділи, заголовки) — глави їх не отримують. */
const RESERVED = ["disputed", "disputed-h", "sources", "sources-h", "st-toc", "st-more-h"];

export function parseStory(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  // Глави не можуть збігтися з id сторінки (розділи, джерела s1…, картки story-…): «## Sources» → sources-2.
  const used = new Set<string>(RESERVED);
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      const text = line.slice(3).trim();
      blocks.push({ type: "h2", id: slugify(text, used), text });
      continue;
    }
    const media = /^\[\[media:(m\d+)\]\]$/.exec(trimmed);
    if (media) {
      flush();
      blocks.push({ type: "media", id: media[1]! });
      continue;
    }
    const widget = /^\[\[block:(b\d+)\]\]$/.exec(trimmed);
    if (widget) {
      flush();
      blocks.push({ type: "widget", id: widget[1]! });
      continue;
    }
    const dir = /^:::(tldr|timeline)\s*$/.exec(trimmed);
    if (dir) {
      flush();
      const items: string[] = [];
      for (i++; i < lines.length && lines[i]!.trim() !== ":::"; i++) {
        const l = lines[i]!.trim();
        if (l.startsWith("- ")) items.push(l.slice(2));
        else if (l && items.length) items[items.length - 1] += ` ${l}`;
      }
      if (dir[1] === "tldr") blocks.push({ type: "tldr", items: items.map(parseInline) });
      else
        blocks.push({
          type: "timeline",
          items: items.map((it) => {
            const bar = it.indexOf("|");
            return bar === -1 ? { date: "", c: parseInline(it) } : { date: it.slice(0, bar).trim(), c: parseInline(it.slice(bar + 1).trim()) };
          }),
        });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && lines[i]!.startsWith(">"); i++) q.push(lines[i]!.replace(/^>\s?/, "").trim());
      i--;
      const cite = q.length > 1 && /^[—–-]\s/.test(q[q.length - 1]!) ? q.pop()!.replace(/^[—–-]\s+/, "") : null;
      blocks.push({ type: "quote", orig: parseInline(q[0] ?? ""), tr: q[1] ? parseInline(q.slice(1).join(" ")) : null, cite });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

/** Слова тексту (без виносок і службових рядків) — для часу читання (макет: ~140 слів/хв). */
export function countWords(md: string): number {
  const text = md
    .replace(FN, "")
    .replace(/\[\[(media|block):\w+\]\]/g, "")
    .replace(/^:::.*$/gm, "")
    .replace(/[#>*_|]/g, " ");
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export const readingMinutes = (words: number) => Math.max(1, Math.ceil(words / 140));
