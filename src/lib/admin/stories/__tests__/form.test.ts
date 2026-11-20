// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFields, describeChanges, toFields, type Fields } from "../form";
import type { StoryFiles } from "../types";
import { validateStory } from "../validate";

const ROOT = join(process.cwd(), "content", "stories");
const slugs = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const load = (slug: string): StoryFiles => ({
  json: readFileSync(join(ROOT, slug, "story.json"), "utf8"),
  uk: readFileSync(join(ROOT, slug, "uk.md"), "utf8"),
  en: readFileSync(join(ROOT, slug, "en.md"), "utf8"),
});
const files = load("jerez-1997");
const edit = (patch: Fields, base = files) => applyFields(base, { ...toFields(base), ...patch });

describe("файли → поля → файли", () => {
  it("нічого не міняли — ті самі байти для всіх 33 історій", () => {
    for (const slug of slugs) {
      const f = load(slug);
      const r = applyFields(f, toFields(f));
      expect(r.changed, slug).toBe(false);
      expect(r.files, slug).toEqual(f);
    }
  });
  it("лід (textarea): перенос рядка з браузера (CRLF) зберігається як LF, не як \\r\\n у JSON", () => {
    const r = edit({ dek_uk: "Перший рядок.\r\nДругий рядок." });
    expect(JSON.parse(r.files.json).dek.uk).toBe("Перший рядок.\nДругий рядок.");
    expect(r.files.json).not.toContain("\\r");
  });
  it("браузерні CRLF у textarea зводяться до LF; без кінцевого \\n його дописано", () => {
    const r = edit({ md_uk: files.uk.replace(/\n/g, "\r\n") });
    expect(r.files.uk).toBe(files.uk);
    expect(edit({ md_en: files.en.trimEnd() }).files.en).toBe(files.en.trimEnd() + "\n");
  });
});

describe("правки", () => {
  it("одне слово в заголовку — змінюється лише story.json, diff на один рядок", () => {
    const r = edit({ title_uk: "Фінал у Хересі (1997)" });
    expect(r.changed).toBe(true);
    expect(r.files.uk).toBe(files.uk);
    const diff = r.files.json.split("\n").filter((l, i) => l !== files.json.split("\n")[i]);
    expect(diff).toEqual(['    "uk": "Фінал у Хересі (1997)",']);
    expect(describeChanges(files, r)).toEqual(["заголовок"]);
  });
  it("статус: чернетка — ключ другим, назад — зникає; без змін порядок не чіпається", () => {
    const d = edit({ status: "draft" });
    expect(Object.keys(JSON.parse(d.files.json)).slice(0, 3)).toEqual(["slug", "status", "category"]);
    expect(describeChanges(files, d)).toEqual(["статус: чернетка (не на сайті)"]);
    const back = applyFields(d.files, { ...toFields(d.files), status: "published" });
    expect(back.files).toEqual(files);
    expect(applyFields(d.files, toFields(d.files)).changed).toBe(false);
  });
  it("нове твердження й джерело отримують наступні id; порожні рядки ігноруються", () => {
    const f = toFields(files);
    const n = Number(f.claims);
    const m = Number(f.sources);
    const r = applyFields(files, {
      ...f,
      claims: String(n + 2),
      [`c.${n}.text`]: "Нове твердження.",
      [`c.${n}.status`]: "one",
      [`c.${n}.sources`]: "s1",
      [`c.${n + 1}.id`]: "",
      sources: String(m + 1),
      [`s.${m}.title`]: "Нова стаття",
      [`s.${m}.publisher`]: "Autosport",
      [`s.${m}.url`]: "https://autosport.example/x",
      [`s.${m}.kind`]: "secondary",
      [`s.${m}.lang`]: "en",
    });
    const story = JSON.parse(r.files.json);
    const maxC = Math.max(...JSON.parse(files.json).claims.map((c: { id: string }) => Number(c.id.slice(1))));
    expect(story.claims.at(-1)).toEqual({ id: `c${maxC + 1}`, text: "Нове твердження.", sources: ["s1"], status: "one" });
    expect(story.claims).toHaveLength(n + 1);
    expect(story.sources.at(-1)).toMatchObject({ title: "Нова стаття", publisher: "Autosport", kind: "secondary" });
    expect(describeChanges(files, r)).toEqual(["твердження: +1", "джерела: +1"]);
  });
  it("видалення й зміна статусу з note/label/reader; порядок ключів твердження збережено", () => {
    const f = toFields(files);
    const disIdx = Number([...Array(Number(f.claims)).keys()].find((i) => f[`c.${i}.status`] === "dis"));
    const r = applyFields(files, { ...f, [`c.0.del`]: "on", [`c.${disIdx}.label_uk`]: "Нова назва суперечки" });
    const story = JSON.parse(r.files.json);
    expect(story.claims).toHaveLength(Number(f.claims) - 1);
    const dis = story.claims.find((c: { id: string }) => c.id === f[`c.${disIdx}.id`]);
    expect(Object.keys(dis)).toEqual(["id", "text", "sources", "status", "note", "label", "reader"]);
    expect(dis.label.uk).toBe("Нова назва суперечки");
    expect(describeChanges(files, r)).toEqual(["твердження: −1 змінено 1"]);
  });
  it("джерела твердження: роздільники кома/пробіл/крапка з комою", () => {
    const f = toFields(files);
    const r = applyFields(files, { ...f, "c.0.sources": "s1;s2  s3,s4" });
    expect(JSON.parse(r.files.json).claims[0].sources).toEqual(["s1", "s2", "s3", "s4"]);
  });
  it("видалене джерело, на яке посилається твердження, ловить валідатор", () => {
    const f = toFields(files);
    const r = applyFields(files, { ...f, "s.0.del": "on" });
    const v = validateStory("jerez-1997", r.story, { uk: r.files.uk, en: r.files.en });
    expect(v.errors.some((e) => e.includes("відсутні в sources"))).toBe(true);
  });
  it("kicker: обидві мови порожні — поля немає; kicker, що був, повертається без змін", () => {
    expect(JSON.parse(edit({ kicker_uk: "", kicker_en: "" }).files.json).kicker).toBeUndefined();
    expect(edit({}).changed).toBe(false);
  });
});
