import { pyList } from "./format";

/**
 * TypeScript-версія правил scripts/content/check_stories.py (формат — content/stories/README.md). Python-скрипт лишається
 * сторожем у CI; ця версія — для адмінки (перевірка перед збереженням). Тексти помилок збігаються символ у символ —
 * це перевіряє тест-паритет (__tests__/validate-parity.test.ts). Змінюєте правило в одному місці — змінюйте в обох.
 */
export type Validation = {
  errors: string[];
  warnings: string[];
  counts: { ok: number; one: number; dis: number };
  words: { uk?: number; en?: number };
};

const CATEGORIES = ["explainer", "history", "scandal", "sensation", "tech"]; // sorted() від множини в Python
const STATUSES = new Set(["ok", "one", "dis"]);
const MARK = /\[\^(c\d+)\]/g;
const MEDIA = /\[\[media:(m\d+)\]\]/g;
const BLOCK = /\[\[block:(b\d+)\]\]/g;
const DIRECTIVE = /^:::(tldr|timeline)\s*$/;
const LIST_ITEM = /^\s*([-*]|\d+\.)\s/;
const MD_LINK = /(?<!\[)\[[^\]^[]+\]\([^)]+\)/;
// Python str.splitlines() ділить і за \v, \f, \x1c–\x1e, \x85, \u2028, \u2029 — без цього паритет ламається на дивних файлах.
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v === undefined || v === null ? "None" : String(v));
const head = (s: string, n: number): string => Array.from(s).slice(0, n).join("");
const findAll = (re: RegExp, text: string): string[] => Array.from(text.matchAll(re), (m) => m[1]!);
const byNum = (a: string, b: string): number => Number(a.slice(1)) - Number(b.slice(1));

/** Видавець для незалежності: «FIA (Stewards)» = FIA; власний розрахунок Outlap з даних Jolpica = Jolpica. */
export function publisherKey(name: unknown): string {
  const text = String(name);
  const key = text.split("(")[0]!.trim().toLowerCase();
  if (key.startsWith("outlap") && text.toLowerCase().includes("jolpica")) return "jolpica";
  return key;
}

export function countWords(text: string): number {
  const clean = text.replace(MARK, "").replace(/[#>*_`[\]()]/g, " ");
  return (clean.match(/[\p{L}\p{N}_'’-]+/gu) ?? []).length;
}

export function validateStory(slug: string, metaIn: unknown, md: { uk?: string; en?: string }): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = obj(metaIn);
  const out: Validation = { errors, warnings, counts: { ok: 0, one: 0, dis: 0 }, words: {} };

  if (meta.slug !== slug) errors.push(`slug у story.json «${str(meta.slug)}» ≠ назва теки «${slug}»`);
  if (!CATEGORIES.includes(meta.category as string)) errors.push(`category «${str(meta.category)}» — не з ${pyList(CATEGORIES)}`);
  for (const key of ["title", "dek"]) {
    for (const lang of ["uk", "en"]) {
      if (!obj(meta[key])[lang]) errors.push(`немає ${key}.${lang}`);
    }
  }

  const sources = arr(meta.sources).map(obj);
  const claims = arr(meta.claims).map(obj);
  const srcIds = sources.map((s) => s.id as string);
  const claimIds = claims.map((c) => c.id as string);
  for (const [kind, ids] of [["джерел", srcIds], ["тверджень", claimIds]] as const) {
    const dup = [...new Set(ids.filter((i, n) => ids.indexOf(i) !== n))].sort();
    if (dup.length) errors.push(`дублікати id ${kind}: ${pyList(dup)}`);
  }
  for (const s of sources) {
    if (String(s.url ?? "").includes("wikipedia.org") || String(s.publisher ?? "").toLowerCase().includes("wikipedia")) {
      errors.push(`джерело ${str(s.id)}: Вікіпедія — не джерело (README, правило 2)`);
    }
    if (!String(s.url ?? "").startsWith("http")) errors.push(`джерело ${str(s.id)}: немає URL`);
  }

  const knownSrc = new Set(srcIds);
  const byId = new Map(sources.map((s) => [s.id as string, s]));
  const usedSrc = new Set<string>();
  for (const c of claims) {
    const cid = str(c.id);
    const st = c.status as string;
    const cs = arr(c.sources) as string[];
    if (!STATUSES.has(st)) {
      errors.push(`${cid}: статус «${str(c.status)}»`);
      continue;
    }
    out.counts[st as "ok" | "one" | "dis"] += 1;
    const missing = cs.filter((x) => !knownSrc.has(x));
    if (missing.length) errors.push(`${cid}: джерела ${pyList(missing)} відсутні в sources`);
    for (const x of cs) usedSrc.add(x);
    if (!cs.length) errors.push(`${cid}: без джерел`);
    // Незалежність — за видавцем: два документи FIA — одне джерело (README, правило статусу ok).
    const publishers = [...new Set(cs.map((x) => publisherKey(byId.get(x)?.publisher ?? x)))].sort();
    if (st === "ok" && publishers.length < 2) errors.push(`${cid}: статус ok, але незалежне джерело одне (${pyList(publishers)})`);
    else if (st === "one" && publishers.length > 1) warnings.push(`${cid}: статус one, але видавців ${publishers.length} (може, ok?)`);
    if (st === "dis" && !c.note) errors.push(`${cid}: статус dis без note`);
    if (st === "dis") {
      for (const key of ["label", "reader"]) {
        if (!["uk", "en"].every((lang) => obj(c[key])[lang])) errors.push(`${cid}: статус dis без ${key}.uk/.en`);
      }
    }
  }
  const unused = [...knownSrc].filter((x) => !usedSrc.has(x)).sort();
  if (unused.length) warnings.push(`джерела без жодного твердження: ${pyList(unused)}`);

  const marks: Partial<Record<"uk" | "en", Set<string>>> = {};
  const blocks: Partial<Record<"uk" | "en", string[]>> = {};
  const mediaIds = new Set(arr(meta.media).map((m) => obj(m).id as string));
  const blockIds = new Set(arr(meta.blocks).map((b) => obj(b).id as string));
  for (const lang of ["uk", "en"] as const) {
    const text = md[lang];
    if (text === undefined) {
      errors.push(`немає ${lang}.md`);
      continue;
    }
    marks[lang] = new Set(findAll(MARK, text));
    blocks[lang] = findAll(BLOCK, text);
    let opened = 0;
    let inside = false;
    let prevQuote = false;
    for (const line of text.split(LINE_BREAK)) {
      const stripped = line.trim();
      // Розмітка, якої розбирач сайту не знає (рев'ю PR #36): на сторінці вона була б сирим текстом.
      if (stripped.startsWith("###") || (stripped.startsWith("#") && !stripped.startsWith("## "))) {
        errors.push(`${lang}.md: заголовок не рівня ## (${head(stripped, 40)})`);
      }
      if (MD_LINK.test(line)) errors.push(`${lang}.md: посилання [текст](url) не підтримується (${head(stripped, 40)})`);
      if (DIRECTIVE.test(stripped)) inside = true;
      else if (stripped === ":::") inside = false;
      else if (LIST_ITEM.test(line) && !inside) errors.push(`${lang}.md: список поза блоком :::tldr/:::timeline (${head(stripped, 40)})`);
      if (stripped === ">" && prevQuote) errors.push(`${lang}.md: порожній рядок «>» усередині цитати`);
      prevQuote = line.startsWith(">");
      // Фото й віджети — лише окремим рядком (так їх розпізнає розбирач сайту src/lib/stories/markdown.ts).
      if ((new RegExp(MEDIA.source).test(line) || new RegExp(BLOCK.source).test(line)) && !/^\s*\[\[(media|block):\w+\]\]\s*$/.test(line)) {
        errors.push(`${lang}.md: [[media/block]] не окремим рядком (${head(line.trim(), 40)})`);
      }
      if (DIRECTIVE.test(line.trim())) opened += 1;
      else if (line.trim() === ":::") opened -= 1;
      if (opened !== 0 && opened !== 1) {
        errors.push(`${lang}.md: вкладені або незакриті блоки ::: (${head(line, 40)})`);
        break;
      }
    }
    if (opened) errors.push(`${lang}.md: незакритий блок :::`);
    const unknownMedia = [...new Set(findAll(MEDIA, text))].filter((x) => !mediaIds.has(x)).sort();
    if (unknownMedia.length) errors.push(`${lang}.md: фото без запису в media ${pyList(unknownMedia)}`);
    const unknownBlocks = [...new Set(blocks[lang])].filter((x) => !blockIds.has(x)).sort();
    if (unknownBlocks.length) errors.push(`${lang}.md: блоки без запису в blocks ${pyList(unknownBlocks)}`);
    out.words[lang] = countWords(text);
    const unknown = [...marks[lang]!].filter((x) => !claimIds.includes(x)).sort(byNum);
    if (unknown.length) errors.push(`${lang}.md: виноски без твердження ${pyList(unknown)}`);
  }
  if (marks.uk && marks.en) {
    const onlyUk = [...marks.uk].filter((x) => !marks.en!.has(x));
    const onlyEn = [...marks.en].filter((x) => !marks.uk!.has(x));
    if (onlyUk.length || onlyEn.length) {
      errors.push(`виноски різняться: лише uk ${pyList(onlyUk.sort(byNum))}, лише en ${pyList(onlyEn.sort(byNum))}`);
    }
  }
  if (blocks.uk && blocks.en && JSON.stringify(blocks.uk) !== JSON.stringify(blocks.en)) {
    errors.push(`блоки [[block:…]] різняться між мовами: uk ${pyList(blocks.uk)}, en ${pyList(blocks.en)}`);
  }
  if (meta.checked !== undefined && meta.checked !== null) {
    const c = String(meta.checked);
    const d = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(c) ? new Date(`${c}T00:00:00Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== c) errors.push(`checked «${c}» — не дата у форматі РРРР-ММ-ДД`);
  }
  const race = meta.race;
  if (race !== undefined && race !== null && !/^\d{4}\/\d{1,2}$/.test(String(race))) errors.push(`race «${String(race)}» — не у форматі рік/етап`);
  for (const s of sources) {
    if ("author" in s && typeof s.author !== "string") errors.push(`джерело ${str(s.id)}: author — не рядок`);
    if ("archive" in s && !(typeof s.archive === "string" && /^https:\/\/web\.archive\.org\/web\/[0-9]{14}\/https?:\/\/\S+$/.test(s.archive))) {
      errors.push(`джерело ${str(s.id)}: archive — не адреса знімка web.archive.org`);
    }
  }
  if (marks.uk) {
    const orphan = claimIds.filter((x) => !marks.uk!.has(x));
    const key = (x: string) => (x && /^\d+$/.test(x.slice(1)) ? Number(x.slice(1)) : 0);
    if (orphan.length) warnings.push(`твердження без виноски в тексті: ${pyList([...new Set(orphan)].sort((a, b) => key(a) - key(b)))}`);
  }
  return out;
}
