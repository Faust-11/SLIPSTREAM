// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readStories } from "../content";

// Чернетки історій (7c, рішення користувача 19.11): `"status": "draft"` у story.json — на сайт не виходить.
const SRC = join(process.cwd(), "content", "stories");
const tmp = mkdtempSync(join(tmpdir(), "stories-draft-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("readStories", () => {
  it("чернетка пропускається, решта — ні; без status — опубліковано", () => {
    for (const slug of ["jerez-1997", "suzuka-1989", "spygate-2007"]) cpSync(join(SRC, slug), join(tmp, slug), { recursive: true });
    expect(readStories(tmp).map((s) => s.raw.slug).sort()).toEqual(["jerez-1997", "spygate-2007", "suzuka-1989"]);

    const path = join(tmp, "jerez-1997", "story.json");
    const story = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ slug: story.slug, status: "draft", ...story }, null, 2));
    expect(readStories(tmp).map((s) => s.raw.slug).sort()).toEqual(["spygate-2007", "suzuka-1989"]);
  });
});
