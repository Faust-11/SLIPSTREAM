// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseStoryJson, serializeStoryJson } from "../format";
import type { StoryJson } from "../types";
import { validateStory } from "../validate";

/**
 * Паритет з scripts/content/check_stories.py (сторож у CI): TS-валідатор адмінки й Python мусять давати ті самі помилки й
 * попередження — на всіх 33 історіях і на навмисно зіпсованих копіях однієї. Розійшлися — виправляти в обох.
 */
const STORIES = join(process.cwd(), "content", "stories");
const SCRIPT = join(process.cwd(), "scripts", "content", "check_stories.py");
const python = spawnSync("python3", ["--version"]).status === 0;

type Md = { uk: string | null; en: string | null };
type Case = { name: string; mutate: (meta: StoryJson, md: Md) => void };
const BASE = "jerez-1997";

const claimWith = (meta: StoryJson, status: string) => meta.claims.find((c) => c.status === status)!;
const cases: Case[] = [
  { name: "clean", mutate: () => {} },
  { name: "slug", mutate: (m) => void (m.slug = "other") },
  { name: "category", mutate: (m) => void (m.category = "gossip") },
  { name: "title-en", mutate: (m) => void (m.title.en = "") },
  { name: "dek-uk-missing", mutate: (m) => void delete (m as Partial<StoryJson>).dek },
  { name: "dup-claim", mutate: (m) => void (m.claims[1]!.id = m.claims[0]!.id) },
  { name: "dup-source", mutate: (m) => void (m.sources[1]!.id = m.sources[0]!.id) },
  { name: "wikipedia", mutate: (m) => void (m.sources[0]!.url = "https://uk.wikipedia.org/wiki/F1") },
  { name: "wikipedia-publisher", mutate: (m) => void (m.sources[0]!.publisher = "Wikipedia") },
  { name: "no-url", mutate: (m) => void (m.sources[2]!.url = "ftp://x") },
  { name: "bad-status", mutate: (m) => void (m.claims[0]!.status = "maybe" as never) },
  { name: "missing-source", mutate: (m) => void m.claims[0]!.sources.push("s999") },
  { name: "no-sources", mutate: (m) => void (m.claims[0]!.sources = []) },
  { name: "ok-one-publisher", mutate: (m) => void (claimWith(m, "ok").sources = [claimWith(m, "ok").sources[0]!]) },
  { name: "one-two-publishers", mutate: (m) => void (claimWith(m, "ok").status = "one") },
  { name: "dis-no-note", mutate: (m) => void delete claimWith(m, "dis").note },
  { name: "dis-no-label", mutate: (m) => void (claimWith(m, "dis").label = { uk: "x", en: "" }) },
  { name: "dis-no-reader", mutate: (m) => void delete claimWith(m, "dis").reader },
  { name: "unused-source", mutate: (m) => void m.sources.push({ id: "s900", title: "t", publisher: "P", url: "https://x.example", kind: "primary", lang: "en" }) },
  { name: "race", mutate: (m) => void (m.race = "1997-17") },
  { name: "author", mutate: (m) => void ((m.sources[0] as { author?: unknown }).author = 5) },
  { name: "archive-not-string", mutate: (m) => void ((m.sources[0] as { archive?: unknown }).archive = 5) },
  { name: "archive-foreign", mutate: (m) => void ((m.sources[0] as { archive?: unknown }).archive = "https://evil.example/web/20260101000000/https://a.example/") },
  { name: "archive-empty", mutate: (m) => void ((m.sources[0] as { archive?: unknown }).archive = "") },
  { name: "archive-ok", mutate: (m) => void ((m.sources[0] as { archive?: unknown }).archive = "https://web.archive.org/web/20261120140746/https://www.fia.com/news/x") },
  { name: "h3", mutate: (_m, md) => void (md.uk += "\n### Підзаголовок\n") },
  { name: "h1", mutate: (_m, md) => void (md.en += "\n# Title\n") },
  { name: "md-link", mutate: (_m, md) => void (md.uk += "\nДив. [тут](https://x.example) ще.\n") },
  { name: "list-outside", mutate: (_m, md) => void (md.uk += "\n- пункт\n1. інший\n") },
  { name: "empty-quote", mutate: (_m, md) => void (md.en += "\n> a\n>\n> b\n") },
  { name: "media-inline", mutate: (m, md) => void ((m.media = []), (md.uk += "\nТекст [[media:m1]] ще\n")) },
  { name: "media-unknown", mutate: (_m, md) => void (md.en += "\n[[media:m77]]\n") },
  { name: "block-unknown", mutate: (_m, md) => void (md.uk += "\n[[block:b5]]\n[[block:b5]]\n") },
  { name: "unclosed", mutate: (_m, md) => void (md.uk += "\n:::tldr\n- пункт[^c1]\n") },
  { name: "nested", mutate: (_m, md) => void (md.en += "\n:::tldr\n:::timeline\n:::\n:::\n") },
  { name: "mark-unknown", mutate: (_m, md) => void (md.uk += " Нове[^c9999]\n") },
  { name: "mark-only-uk", mutate: (_m, md) => void (md.en = md.en!.replace(/\[\^c1\]/g, "")) },
  { name: "no-en", mutate: (_m, md) => void (md.en = null) },
  { name: "no-uk", mutate: (_m, md) => void (md.uk = null) },
];

const work = existsSync(STORIES) ? mkdtempSync(join(tmpdir(), "stories-parity-")) : "";
afterAll(() => work && rmSync(work, { recursive: true, force: true }));

type Report = { errors: string[]; warnings: string[] };
function runPython(root: string): Map<string, Report> {
  const res = spawnSync("python3", [SCRIPT], { env: { ...process.env, STORIES_ROOT: root }, encoding: "utf8" });
  const reports = new Map<string, Report>();
  let cur: Report | null = null;
  for (const line of res.stdout.split("\n")) {
    const head = /^[✓✗] (\S+)/.exec(line);
    if (head) reports.set(head[1]!, (cur = { errors: [], warnings: [] }));
    else if (cur && line.startsWith("    помилка: ")) cur.errors.push(line.slice("    помилка: ".length));
    else if (cur && line.startsWith("    увага: ")) cur.warnings.push(line.slice("    увага: ".length));
  }
  return reports;
}

function ts(dir: string, slug: string): Report {
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : undefined);
  const v = validateStory(slug, JSON.parse(read("story.json")!), { uk: read("uk.md"), en: read("en.md") });
  return { errors: v.errors, warnings: v.warnings };
}

describe.skipIf(!python)("TS-валідатор = check_stories.py", () => {
  it("усі наявні історії: ті самі помилки й попередження (зараз — без помилок)", () => {
    const names = readdirSync(STORIES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const py = runPython(STORIES);
    expect(py.size).toBe(names.length);
    for (const slug of names) {
      const got = ts(join(STORIES, slug), slug);
      expect({ slug, ...got }).toEqual({ slug, ...py.get(slug)! });
      expect(got.errors).toEqual([]);
    }
  });

  it("зіпсовані копії: однакові тексти й порядок", () => {
    for (const c of cases) {
      const dir = join(work, `m-${c.name}`);
      cpSync(join(STORIES, BASE), dir, { recursive: true });
      const { story, trailingNewline } = parseStoryJson(readFileSync(join(dir, "story.json"), "utf8"));
      const md: Md = { uk: readFileSync(join(dir, "uk.md"), "utf8"), en: readFileSync(join(dir, "en.md"), "utf8") };
      story.slug = `m-${c.name}`;
      c.mutate(story, md);
      writeFileSync(join(dir, "story.json"), serializeStoryJson(story, trailingNewline));
      for (const lang of ["uk", "en"] as const) {
        if (md[lang] === null) rmSync(join(dir, `${lang}.md`));
        else writeFileSync(join(dir, `${lang}.md`), md[lang]!);
      }
    }
    // Python бачить лише теки цього каталогу.
    const py = runPython(work);
    const failing: string[] = [];
    for (const c of cases) {
      const slug = `m-${c.name}`;
      const got = ts(join(work, slug), slug);
      const want = py.get(slug);
      if (!want || JSON.stringify(got) !== JSON.stringify(want)) failing.push(`${c.name}\n  ts: ${JSON.stringify(got)}\n  py: ${JSON.stringify(want)}`);
    }
    expect(failing).toEqual([]);
    // Кожен випадок справді щось знаходить (крім clean) — інакше тест нічого не доводить.
    for (const c of cases.filter((x) => x.name !== "clean" && x.name !== "archive-ok")) {
      const r = py.get(`m-${c.name}`)!;
      expect(r.errors.length + r.warnings.length, c.name).toBeGreaterThan(0);
    }
  });
});

describe("serializeStoryJson", () => {
  it("усі наявні story.json — байт-у-байт (формат запису збігається з файлами)", () => {
    for (const d of readdirSync(STORIES, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const raw = readFileSync(join(STORIES, d.name, "story.json"), "utf8");
      const { story, trailingNewline } = parseStoryJson(raw);
      expect(serializeStoryJson(story, trailingNewline), d.name).toBe(raw);
    }
  });
});
