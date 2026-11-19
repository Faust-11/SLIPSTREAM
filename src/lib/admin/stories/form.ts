import { parseStoryJson, serializeStoryJson } from "./format";
import type { StoryClaim, StoryFiles, StoryJson, StorySource } from "./types";

/**
 * Редактор історії (7c, задача 3): файли ↔ плоскі поля форми. Форма — звичайний HTML без JS-стану, тож усе, що в ній
 * є, — рядки з іменами:
 *   title_uk … dek_en, kicker_uk/en, checked, status (published|draft), md_uk, md_en;
 *   claims = число рядків, c.<i>.{id,text,status,sources,note,label_uk,label_en,reader_uk,reader_en,del};
 *   sources = число рядків, s.<i>.{id,title,publisher,date,url,kind,lang,author,archive,del}.
 * Нове твердження/джерело — останній (порожній) рядок форми: id присвоюється тут (`c<N+1>`, `s<N+1>`).
 * Властивість, на якій тримається все: `applyFields(files, toFields(files))` повертає ті самі файли байт-у-байт
 * (тест на всіх 33 історіях) — тож правка одного слова — це diff одного слова.
 */
export type Fields = Record<string, string>;

export const CLAIM_FIELDS = ["id", "text", "status", "sources", "note", "label_uk", "label_en", "reader_uk", "reader_en"] as const;
export const SOURCE_FIELDS = ["id", "title", "publisher", "date", "url", "kind", "lang", "author", "archive"] as const;

const l10n = (v: unknown, lang: "uk" | "en"): string => {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return typeof o[lang] === "string" ? (o[lang] as string) : "";
};

export function toFields(files: StoryFiles): Fields {
  const { story } = parseStoryJson(files.json);
  const f: Fields = {
    title_uk: l10n(story.title, "uk"),
    title_en: l10n(story.title, "en"),
    dek_uk: l10n(story.dek, "uk"),
    dek_en: l10n(story.dek, "en"),
    kicker_uk: l10n(story.kicker, "uk"),
    kicker_en: l10n(story.kicker, "en"),
    checked: typeof story.checked === "string" ? story.checked : "",
    status: story.status === "draft" ? "draft" : "published",
    md_uk: files.uk,
    md_en: files.en,
  };
  const claims = Array.isArray(story.claims) ? story.claims : [];
  claims.forEach((c, i) => {
    f[`c.${i}.id`] = String(c.id ?? "");
    f[`c.${i}.text`] = String(c.text ?? "");
    f[`c.${i}.status`] = String(c.status ?? "");
    f[`c.${i}.sources`] = (Array.isArray(c.sources) ? c.sources : []).join(", ");
    f[`c.${i}.note`] = typeof c.note === "string" ? c.note : "";
    f[`c.${i}.label_uk`] = l10n(c.label, "uk");
    f[`c.${i}.label_en`] = l10n(c.label, "en");
    f[`c.${i}.reader_uk`] = l10n(c.reader, "uk");
    f[`c.${i}.reader_en`] = l10n(c.reader, "en");
  });
  f.claims = String(claims.length);
  const sources = Array.isArray(story.sources) ? story.sources : [];
  sources.forEach((s, i) => {
    for (const k of SOURCE_FIELDS) f[`s.${i}.${k}`] = typeof s[k] === "string" ? (s[k] as string) : "";
  });
  f.sources = String(sources.length);
  return f;
}

const trim = (v: string | undefined): string => (v ?? "").trim();
/** Браузер надсилає перенесення рядків textarea як CRLF; у файлах — LF. */
const lf = (v: string | undefined): string => (v ?? "").replace(/\r\n?/g, "\n");
const num = (v: string | undefined, cap: number): number => Math.min(Math.max(Number.parseInt(v ?? "", 10) || 0, 0), cap);
const idNumber = (id: string, prefix: string): number => (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)) ? Number(id.slice(prefix.length)) : 0);

/** Необов'язкове рядкове поле: порожнє — ключа немає, окрім випадку, коли в файлі вже стояв `""` чи `null` (так є в даних — не чіпаємо). */
function setOptional(target: Record<string, unknown>, key: string, value: string, before: Record<string, unknown>): void {
  if (value) target[key] = value;
  else if (before[key] !== "" && before[key] !== null) delete target[key];
}

/** Пара uk/en: обидві порожні — поля немає; інакше — об'єкт зі збереженням порядку ключів наявного. */
function setPair(target: Record<string, unknown>, key: string, uk: string, en: string): void {
  if (!uk && !en) {
    delete target[key];
    return;
  }
  const prev = typeof target[key] === "object" && target[key] !== null ? (target[key] as Record<string, unknown>) : {};
  target[key] = { ...prev, uk, en };
}

export const MAX_ROWS = 300;

export type Applied = { files: StoryFiles; story: StoryJson; changed: boolean };

export function applyFields(current: StoryFiles, f: Fields): Applied {
  const { story: before, trailingNewline } = parseStoryJson(current.json);
  const story = structuredClone(before);

  story.title = { ...(story.title ?? {}), uk: trim(f.title_uk), en: trim(f.title_en) };
  story.dek = { ...(story.dek ?? {}), uk: trim(f.dek_uk), en: trim(f.dek_en) };
  setPair(story, "kicker", trim(f.kicker_uk), trim(f.kicker_en));
  if (trim(f.checked)) story.checked = trim(f.checked);
  else delete story.checked;

  // `status` — другий ключ (після slug); «опубліковано» = ключа немає. Порядок ключів чіпаємо лише коли статус міняється.
  const wantDraft = f.status === "draft";
  if (wantDraft !== (before.status === "draft")) {
    const rest = Object.entries(story).filter(([k]) => k !== "status");
    const ordered = wantDraft ? Object.fromEntries([...rest.slice(0, 1), ["status", "draft"], ...rest.slice(1)]) : Object.fromEntries(rest);
    for (const k of Object.keys(story)) delete story[k];
    Object.assign(story, ordered);
  }

  const oldClaims = new Map((before.claims ?? []).map((c) => [c.id, c]));
  const claims: StoryClaim[] = [];
  let nextClaim = Math.max(0, ...(before.claims ?? []).map((c) => idNumber(String(c.id), "c")));
  for (let i = 0; i < num(f.claims, MAX_ROWS); i++) {
    const p = (k: string) => f[`c.${i}.${k}`];
    if (p("del") === "on") continue;
    let id = trim(p("id"));
    const text = trim(lf(p("text")));
    if (!id && !text) continue; // порожній рядок «додати»
    if (!id) id = `c${++nextClaim}`;
    const out = { ...((oldClaims.get(id) ?? {}) as Record<string, unknown>) };
    out.id = id;
    out.text = text;
    out.sources = trim(p("sources")).split(/[\s,;]+/).filter(Boolean);
    out.status = trim(p("status"));
    setOptional(out, "note", trim(lf(p("note"))), (oldClaims.get(id) ?? {}) as Record<string, unknown>);
    setPair(out, "label", trim(p("label_uk")), trim(p("label_en")));
    setPair(out, "reader", trim(lf(p("reader_uk"))), trim(lf(p("reader_en"))));
    claims.push(out as unknown as StoryClaim);
  }
  story.claims = claims;

  const oldSources = new Map((before.sources ?? []).map((s) => [s.id, s]));
  const sources: StorySource[] = [];
  let nextSource = Math.max(0, ...(before.sources ?? []).map((s) => idNumber(String(s.id), "s")));
  for (let i = 0; i < num(f.sources, MAX_ROWS); i++) {
    const p = (k: string) => trim(f[`s.${i}.${k}`]);
    if (f[`s.${i}.del`] === "on") continue;
    let id = p("id");
    if (!id && !p("title") && !p("url")) continue;
    if (!id) id = `s${++nextSource}`;
    const out = { ...((oldSources.get(id) ?? {}) as Record<string, unknown>) };
    out.id = id;
    out.title = p("title");
    out.publisher = p("publisher");
    const was = (oldSources.get(id) ?? {}) as Record<string, unknown>;
    setOptional(out, "date", p("date"), was);
    out.url = p("url");
    out.kind = p("kind");
    out.lang = p("lang");
    setOptional(out, "author", p("author"), was);
    setOptional(out, "archive", p("archive"), was);
    sources.push(out as unknown as StorySource);
  }
  story.sources = sources;

  const md = (v: string | undefined): string => {
    const t = lf(v);
    return t.endsWith("\n") ? t : `${t}\n`;
  };
  const files: StoryFiles = { json: serializeStoryJson(story, trailingNewline), uk: md(f.md_uk), en: md(f.md_en) };
  return { files, story, changed: files.json !== current.json || files.uk !== current.uk || files.en !== current.en };
}

/** Що змінилось — для заголовка й тіла PR. */
export function describeChanges(before: StoryFiles, after: Applied): string[] {
  const a = parseStoryJson(before.json).story;
  const b = after.story;
  const out: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(a.status ?? null, b.status ?? null)) out.push(b.status === "draft" ? "статус: чернетка (не на сайті)" : "статус: опубліковано");
  if (!same(a.title, b.title)) out.push("заголовок");
  if (!same(a.dek, b.dek)) out.push("лід");
  if (!same(a.kicker ?? null, b.kicker ?? null)) out.push("kicker");
  if (before.uk !== after.files.uk) out.push("текст uk");
  if (before.en !== after.files.en) out.push("текст en");
  const diffList = <T extends { id: string }>(label: string, x: T[], y: T[]) => {
    const old = new Map(x.map((i) => [i.id, i]));
    const nw = new Map(y.map((i) => [i.id, i]));
    const added = y.filter((i) => !old.has(i.id)).length;
    const removed = x.filter((i) => !nw.has(i.id)).length;
    const edited = y.filter((i) => old.has(i.id) && !same(old.get(i.id), i)).length;
    const parts = [added && `+${added}`, removed && `−${removed}`, edited && `змінено ${edited}`].filter(Boolean);
    if (parts.length) out.push(`${label}: ${parts.join(" ")}`);
  };
  diffList("твердження", a.claims ?? [], b.claims ?? []);
  diffList("джерела", a.sources ?? [], b.sources ?? []);
  if (!same(a.checked ?? null, b.checked ?? null)) out.push("дата перевірки");
  return out;
}
