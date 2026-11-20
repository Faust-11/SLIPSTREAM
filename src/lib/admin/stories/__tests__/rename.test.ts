// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRedirects, storyRedirectRules } from "@/lib/stories/redirects";
import { CODE_PINNED, REDIRECTS_PATH, checkNewSlug, planRename, type RenameInput } from "../rename";
import { validateStory } from "../validate";

const ROOT = process.cwd();
const STORIES = join(ROOT, "content/stories");
const slugs = readdirSync(STORIES, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(STORIES, d.name, "story.json"))).map((d) => d.name);
const read = (slug: string, f: string) => readFileSync(join(STORIES, slug, f), "utf8");

/** Вхід плану з реальних файлів у репозиторії (без GitHub): так само, як його збере завантажувач. */
function input(from: string, to: string, redirects: Record<string, string> = {}): RenameInput {
  const dir = join(ROOT, "public/img/stories", from);
  return {
    from,
    to,
    files: { json: read(from, "story.json"), uk: read(from, "uk.md"), en: read(from, "en.md") },
    photos: existsSync(dir) ? readdirSync(dir).map((name) => ({ name, sha: `sha-${name}` })) : [],
    referrers: slugs.filter((s) => s !== from).map((s) => ({ slug: s, json: read(s, "story.json") })),
    existing: slugs,
    redirects,
  };
}

const paths = (p: ReturnType<typeof planRename>) => (p.ok ? p.changes.map((c) => c.path) : []);

describe("planRename — brawn-gp-2009 (на нього посилається button-canada-2011)", () => {
  const plan = planRename(input("brawn-gp-2009", "brawn-champions"));
  it("план успішний; тека, фото, посилання й редирект — у одному наборі", () => {
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.summary.linkedStories).toEqual(["button-canada-2011"]);
    expect(plan.summary.photos).toBeGreaterThan(0);
    const p = paths(plan);
    for (const f of ["story.json", "uk.md", "en.md"]) {
      expect(p).toContain(`content/stories/brawn-gp-2009/${f}`);
      expect(p).toContain(`content/stories/brawn-champions/${f}`);
    }
    expect(p).toContain("content/stories/button-canada-2011/story.json");
    expect(p).toContain(REDIRECTS_PATH);
    expect(p.filter((x) => x.startsWith("public/img/stories/brawn-gp-2009/")).length).toBe(plan.summary.photos);
    expect(p.filter((x) => x.startsWith("public/img/stories/brawn-champions/")).length).toBe(plan.summary.photos);
    expect(new Set(p).size).toBe(p.length); // один файл двічі в PR — помилка publish()
  });
  it("старі файли видаляються, нові — з тим самим змістом; фото — той самий blob", () => {
    if (!plan.ok) throw new Error("план не вдався");
    const byPath = new Map(plan.changes.map((c) => [c.path, c]));
    expect(byPath.get("content/stories/brawn-gp-2009/uk.md")).toEqual({ path: "content/stories/brawn-gp-2009/uk.md", content: null });
    expect((byPath.get("content/stories/brawn-champions/uk.md") as { content: string }).content).toBe(read("brawn-gp-2009", "uk.md"));
    const photo = plan.changes.find((c) => c.path.startsWith("public/img/stories/brawn-champions/")) as { sha: string; path: string };
    expect(photo.sha).toBe(`sha-${photo.path.split("/").pop()}`);
  });
  it("story.json: slug і шляхи фото нові, решта — байт-у-байт; результат проходить валідатор", () => {
    if (!plan.ok) throw new Error("план не вдався");
    const raw = read("brawn-gp-2009", "story.json");
    const out = (plan.changes.find((c) => c.path === "content/stories/brawn-champions/story.json") as { content: string }).content;
    expect(out.replaceAll("brawn-champions", "brawn-gp-2009")).toBe(raw);
    expect(out.includes("brawn-gp-2009")).toBe(false);
    expect(validateStory("brawn-champions", JSON.parse(out), { uk: read("brawn-gp-2009", "uk.md"), en: read("brawn-gp-2009", "en.md") }).errors).toEqual([]);
  });
  it("посилання в іншій історії замінено, решта її файла не чіпається", () => {
    if (!plan.ok) throw new Error("план не вдався");
    const raw = read("button-canada-2011", "story.json");
    const out = (plan.changes.find((c) => c.path === "content/stories/button-canada-2011/story.json") as { content: string }).content;
    expect(JSON.parse(out).links.stories).toContain("brawn-champions");
    expect(JSON.parse(out).links.stories).not.toContain("brawn-gp-2009");
    expect(out.replaceAll("brawn-champions", "brawn-gp-2009")).toBe(raw);
  });
  it("редирект: старий → новий; JSON з кінцевим переносом рядка", () => {
    if (!plan.ok) throw new Error("план не вдався");
    const c = plan.changes.find((x) => x.path === REDIRECTS_PATH) as { content: string };
    expect(JSON.parse(c.content)).toEqual({ "brawn-gp-2009": "brawn-champions" });
    expect(c.content.endsWith("\n")).toBe(true);
  });
});

describe("planRename — відмови", () => {
  const errs = (p: ReturnType<typeof planRename>) => (p.ok ? [] : p.errors.join(" | "));
  it("адреса, прописана в коді (головна, Lighthouse)", () => {
    for (const s of Object.keys(CODE_PINNED)) expect(errs(planRename(input(s, "new-address")))).toContain("прописана в коді");
  });
  it.each(["", "Brawn", "brawn_gp", "brawn gp", "-brawn", "../x", "brawn/gp", "а-кирилиця", "x".repeat(57)])("некоректна нова адреса %j", (to) => {
    expect(errs(planRename(input("brawn-gp-2009", to)))).toContain("лише малі латинські");
  });
  it("збігається зі старою, вже існує, раніше була редиректом", () => {
    expect(errs(planRename(input("brawn-gp-2009", "brawn-gp-2009")))).toContain("збігається");
    expect(errs(planRename(input("brawn-gp-2009", "spa-2021")))).toContain("уже є");
    expect(errs(planRename(input("brawn-gp-2009", "old-name", { "old-name": "spa-2021" })))).toContain("є редирект");
  });
  it("історії немає", () => expect(errs(planRename(input("brawn-gp-2009", "x1")) && planRename({ ...input("brawn-gp-2009", "x1"), from: "nope", existing: slugs }))).toContain("немає"));
});

describe("редиректи", () => {
  it("ланцюжок A→B, потім B→C: A веде одразу на C", () => {
    const first = planRename(input("brawn-gp-2009", "brawn-b"));
    if (!first.ok) throw new Error("перший крок");
    const redirects = JSON.parse((first.changes.find((c) => c.path === REDIRECTS_PATH) as { content: string }).content);
    // другий крок: історія тепер називається brawn-b (файли ті самі)
    const second = planRename({ ...input("brawn-gp-2009", "brawn-c", redirects), from: "brawn-b", existing: [...slugs.filter((s) => s !== "brawn-gp-2009"), "brawn-b"] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(JSON.parse((second.changes.find((c) => c.path === REDIRECTS_PATH) as { content: string }).content)).toEqual({ "brawn-b": "brawn-c", "brawn-gp-2009": "brawn-c" });
  });
  it("parseRedirects відкидає сміття, storyRedirectRules — обидві мови", () => {
    expect(parseRedirects({ a: "b", "BAD": "x", c: 5, d: "d", e: "../f" })).toEqual({ a: "b" });
    expect(parseRedirects([1, 2])).toEqual({});
    expect(parseRedirects(null)).toEqual({});
    expect(storyRedirectRules({ a: "b" })).toEqual([
      { source: "/stories/a", destination: "/stories/b", permanent: true },
      { source: "/uk/stories/a", destination: "/uk/stories/b", permanent: true },
    ]);
  });
  it("checkNewSlug окремо", () => expect(checkNewSlug("a", "b", ["a"], {})).toEqual([]));
});

describe("story-redirects.json у репозиторії — сторож (CI зупиняє PR зі зламаним редиректом)", () => {
  const map = JSON.parse(readFileSync(join(ROOT, REDIRECTS_PATH), "utf8")) as Record<string, string>;
  it("усе — коректні пари; `від` не є справжньою історією; `до` — є; циклів немає", () => {
    expect(parseRedirects(map)).toEqual(map);
    for (const [from, to] of Object.entries(map)) {
      expect(slugs, `від ${from}`).not.toContain(from);
      expect(slugs, `до ${to}`).toContain(to);
      expect(map[to], `ланцюжок ${from} → ${to}`).toBeUndefined(); // `до` не є сам старою адресою
    }
  });
});

describe("CODE_PINNED — список адрес, прописаних у коді, правдивий", () => {
  it("кожна історія, чия адреса згадана в коді (src, scripts), є в CODE_PINNED, і навпаки", () => {
    const found = new Set<string>();
    for (const s of slugs) {
      let files: string[] = [];
      try {
        files = execFileSync("git", ["grep", "-lF", "-e", s, "--", "src", "scripts", "next.config.ts", ":!src/data", ":!**/__tests__/**", ":!src/i18n"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
      } catch {
        /* git grep без збігів повертає код 1 */
      }
      if (files.length) found.add(s);
    }
    expect([...found].sort()).toEqual(Object.keys(CODE_PINNED).sort());
  });
});
