// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { filterCounts, filterRows, listStories, parseFilter, readRow } from "../list";

const root = mkdtempSync(join(tmpdir(), "stories-list-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const src = (id: string, publisher: string, url: string, archive?: string) => ({ id, title: id, publisher, url, kind: "primary", lang: "en", ...(archive ? { archive } : {}) });
function put(slug: string, patch: Record<string, unknown> = {}, md: { uk?: string; en?: string } = { uk: "Текст[^c1]\n", en: "Text[^c1]\n" }) {
  mkdirSync(join(root, slug), { recursive: true });
  const story = {
    slug,
    category: "scandal",
    race: "1997/17",
    title: { uk: `Історія ${slug}`, en: slug },
    dek: { uk: "л", en: "l" },
    sources: [src("s1", "FIA", "https://fia.example/a", "https://web.archive.org/web/2026/https://fia.example/a"), src("s2", "Autosport", "https://autosport.example/b"), src("s3", "Jolpica", "https://api.jolpi.ca/x")],
    claims: [{ id: "c1", text: "t", sources: ["s1", "s2"], status: "ok" }],
    ...patch,
  };
  writeFileSync(join(root, slug, "story.json"), JSON.stringify(story, null, 2) + "\n");
  if (md.uk !== undefined) writeFileSync(join(root, slug, "uk.md"), md.uk);
  if (md.en !== undefined) writeFileSync(join(root, slug, "en.md"), md.en);
}

put("alpha");
put("beta", { status: "draft" });
put("gamma", {}, { uk: "Текст[^c1][^c2]\n", en: "Text[^c1]\n" }); // сноски розійшлись → помилка
mkdirSync(join(root, "broken"));
writeFileSync(join(root, "broken", "story.json"), "{ не json");
mkdirSync(join(root, "empty")); // тека без story.json

describe("readRow", () => {
  it("рахує твердження, слова, джерела й архів (Jolpica не рахується)", () => {
    const r = readRow(root, "alpha");
    expect(r).toMatchObject({ slug: "alpha", title: "Історія alpha", status: "published", year: 1997, category: "scandal" });
    expect(r.claims).toEqual({ total: 1, ok: 1, one: 0, dis: 0 });
    expect(r.sources).toBe(3);
    expect({ archivable: r.archivable, archived: r.archived }).toEqual({ archivable: 2, archived: 1 });
    expect(r.errors).toEqual([]);
    expect(r.words.uk).toBeGreaterThan(0);
  });
  it("status: draft", () => expect(readRow(root, "beta").status).toBe("draft"));
  it("помилки валідації потрапляють у рядок", () => expect(readRow(root, "gamma").errors.join("|")).toContain("виноски"));
  it("зламаний JSON і порожня тека — рядок з помилкою, не виняток", () => {
    expect(readRow(root, "broken").errors[0]).toContain("невалідний JSON");
    expect(readRow(root, "empty")).toMatchObject({ title: "empty", errors: ["немає story.json"] });
  });
});

describe("список", () => {
  const rows = listStories(root);
  it("чернетки першими, далі за кількістю помилок (більше — вище), далі за адресою", () => {
    expect(rows.map((r) => r.slug)).toEqual(["beta", "gamma", "broken", "empty", "alpha"]);
  });
  it("фільтри й лічильники", () => {
    expect(filterRows(rows, "draft", "").map((r) => r.slug)).toEqual(["beta"]);
    expect(filterRows(rows, "errors", "").map((r) => r.slug)).toEqual(["gamma", "broken", "empty"]);
    expect(filterCounts(rows)).toEqual({ all: 5, draft: 1, errors: 3, noarchive: 3 });
  });
  it("пошук без регістру за адресою й заголовком", () => {
    expect(filterRows(rows, "all", "ІСТОРІЯ ALP").map((r) => r.slug)).toEqual(["alpha"]);
    expect(filterRows(rows, "all", "gam").map((r) => r.slug)).toEqual(["gamma"]);
    expect(filterRows(rows, "draft", "alpha")).toEqual([]);
  });
  it("parseFilter: невідоме значення = all", () => {
    expect(parseFilter("draft")).toBe("draft");
    expect(parseFilter("<script>")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
  });
});

describe("справжні історії", () => {
  it("усі 33 читаються без помилок, жодної чернетки", () => {
    const rows = listStories();
    expect(rows.length).toBe(33);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    expect(rows.filter((r) => r.status === "draft")).toEqual([]);
    expect(rows.find((r) => r.slug === "jerez-1997")).toMatchObject({ title: "Фінал у Хересі", year: 1997 });
  });
});
