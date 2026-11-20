// @vitest-environment node
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyFields, toFields } from "../form";
import { parseStoryJson } from "../format";
import { listStories } from "../list";
import { checkTranslation, hashUnit, splitSections, stampTranslation, staleSummary } from "../translation";

const UK = "Вступ[^c1]\n\n## Перший\nТекст один.[^c1]\n\n## Другий\nТекст два.\n";
const EN = "Intro[^c1]\n\n## First\nText one.[^c1]\n\n## Second\nText two.\n";
const story = (over: Record<string, unknown> = {}) => ({ title: { uk: "Назва", en: "Title" }, dek: { uk: "Лід", en: "Lead" }, kicker: { uk: "Штамп", en: "Kicker" }, ...over });

describe("splitSections", () => {
  it("вступ + розділи за порядком; без вступу — лише розділи", () => {
    expect(splitSections(UK).map((s) => [s.key, s.label])).toEqual([
      ["intro", "Вступ (до першого розділу)"],
      ["sec1", "Розділ 1 «Перший»"],
      ["sec2", "Розділ 2 «Другий»"],
    ]);
    expect(splitSections("## Лише\nтекст\n").map((s) => s.key)).toEqual(["sec1"]);
    expect(splitSections("")).toEqual([]);
  });
});

describe("checkTranslation", () => {
  const base = story();
  const stamped = story({ translated: stampTranslation(base, UK) });
  it("без `translated` — «без відмітки»", () => expect(checkTranslation(base, { uk: UK, en: EN }).status).toBe("unmarked"));
  it("зі свіжою відміткою — ok", () => expect(checkTranslation(stamped, { uk: UK, en: EN })).toMatchObject({ status: "ok", stale: [], removed: [], structure: null }));
  it("зміна пробілів і перенесень не робить переклад застарілим", () => {
    expect(checkTranslation(stamped, { uk: UK.replace("Текст один.", "Текст   один."), en: EN }).status).toBe("ok");
    expect(checkTranslation(stamped, { uk: UK.replace(/\n/g, "\r\n"), en: EN }).status).toBe("ok");
  });
  it("змінився один розділ — застарів саме він", () => {
    const c = checkTranslation(stamped, { uk: UK.replace("Текст два.", "Текст два, виправлено."), en: EN });
    expect(c.status).toBe("stale");
    expect(c.stale.map((u) => u.key)).toEqual(["sec2"]);
    expect(staleSummary(c)).toBe("Розділ 2 «Другий»");
  });
  it("змінився заголовок / лід / kicker — застарів саме він", () => {
    expect(checkTranslation({ ...stamped, title: { uk: "Нова назва", en: "Title" } }, { uk: UK, en: EN }).stale.map((u) => u.key)).toEqual(["title"]);
    expect(checkTranslation({ ...stamped, dek: { uk: "Інший лід", en: "Lead" } }, { uk: UK, en: EN }).stale.map((u) => u.key)).toEqual(["dek"]);
    expect(checkTranslation({ ...stamped, kicker: { uk: "Інше", en: "Kicker" } }, { uk: UK, en: EN }).stale.map((u) => u.key)).toEqual(["kicker"]);
  });
  it("правка англійської сама по собі нічого не міняє", () => {
    expect(checkTranslation(stamped, { uk: UK, en: EN.replace("Text two.", "Totally different.") }).status).toBe("ok");
  });
  it("розділ видалили в оригіналі — це видно; новий розділ — застарів", () => {
    const fewer = UK.replace("\n## Другий\nТекст два.\n", "");
    const c1 = checkTranslation(stamped, { uk: fewer, en: EN });
    expect(c1.status).toBe("stale");
    expect(c1.removed).toEqual(["sec2"]);
    const more = `${UK}\n## Третій\nТекст три.\n`;
    const c2 = checkTranslation(stamped, { uk: more, en: EN });
    expect(c2.stale.map((u) => u.key)).toEqual(["sec3"]);
  });
  it("різна кількість розділів uk/en — застарів", () => {
    const c = checkTranslation(stamped, { uk: UK, en: "## One\ntext\n" });
    expect(c).toMatchObject({ status: "stale", structure: { uk: 2, en: 1 } });
    expect(staleSummary(c)).toContain("розділів: uk 2, en 1");
  });
  it("hashUnit стабільний (змінюєте алгоритм — перемітьте всі історії)", () => expect(hashUnit("Фінал у Хересі")).toBe(hashUnit("  Фінал   у\nХересі ")));
});

describe("форма: «переклад актуальний»", () => {
  const files = (() => {
    const s = story({ slug: "x", sources: [], claims: [], translated: stampTranslation(story(), "") });
    return { json: JSON.stringify(s, null, 2) + "\n", uk: UK, en: EN };
  })();
  it("без галочки хеші не чіпаються, навіть коли uk змінили", () => {
    const f = { ...toFields(files), md_uk: UK.replace("Текст два.", "Текст два!") };
    const a = applyFields(files, f);
    expect(parseStoryJson(a.files.json).story.translated).toEqual(parseStoryJson(files.json).story.translated);
    expect(checkTranslation(a.story, { uk: a.files.uk, en: a.files.en }).status).toBe("stale");
  });
  it("з галочкою хеші беруться з українського тексту, що зберігається", () => {
    const f = { ...toFields(files), md_uk: UK.replace("Текст два.", "Текст два!"), translated_ok: "on" };
    const a = applyFields(files, f);
    expect(checkTranslation(a.story, { uk: a.files.uk, en: a.files.en }).status).toBe("ok");
    expect(a.changed).toBe(true);
  });
  it("з галочкою на вже актуальному — нічого не міняється", () => {
    const stampedNow = { ...files, json: JSON.stringify({ ...JSON.parse(files.json), translated: stampTranslation(story(), UK) }, null, 2) + "\n" };
    expect(applyFields(stampedNow, { ...toFields(stampedNow), translated_ok: "on" }).changed).toBe(false);
  });
});

describe("справжні історії", () => {
  it("у кожної є відмітка перекладу (нова історія — спершу `node scripts/content/stamp_translation.mjs <slug>`)", () => {
    const rows = listStories();
    expect(rows.filter((r) => r.translation.status === "unmarked").map((r) => r.slug)).toEqual([]);
  });
});

describe("scripts/content/stamp_translation.mjs", () => {
  const root = mkdtempSync(join(tmpdir(), "stamp-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  it("відмічає тільки те, що просили, і не чіпає решту файла", () => {
    cpSync(join(process.cwd(), "content/stories/jerez-1997"), join(root, "a"), { recursive: true });
    cpSync(join(process.cwd(), "content/stories/jerez-1997"), join(root, "b"), { recursive: true });
    for (const d of ["a", "b"]) {
      const p = join(root, d, "story.json");
      const j = JSON.parse(readFileSync(p, "utf8"));
      delete j.translated;
      j.slug = d;
      writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    }
    const before = readFileSync(join(root, "b", "story.json"), "utf8");
    const out = execFileSync("node", ["--no-warnings", "--experimental-strip-types", "scripts/content/stamp_translation.mjs", "a"], { env: { ...process.env, STORIES_ROOT: root }, encoding: "utf8" });
    expect(out).toContain("Відмічено: 1 з 1");
    expect(readFileSync(join(root, "b", "story.json"), "utf8")).toBe(before);
    const a = readFileSync(join(root, "a", "story.json"), "utf8");
    const { story } = parseStoryJson(a);
    expect(story.translated).toEqual(stampTranslation(story, readFileSync(join(root, "a", "uk.md"), "utf8")));
    // другий запуск на тих самих даних — без змін
    expect(execFileSync("node", ["--no-warnings", "--experimental-strip-types", "scripts/content/stamp_translation.mjs", "--missing"], { env: { ...process.env, STORIES_ROOT: root }, encoding: "utf8" })).toContain("Відмічено: 1 з 2");
  });
});
