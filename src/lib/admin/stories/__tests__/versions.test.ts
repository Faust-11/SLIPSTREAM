// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHub } from "../../github";
import { openStoryPrs } from "../store";
import { listVersions, loadVersion, parsePatch, prKind } from "../versions";

const admin = [{ name: "admin" }];
const pr = (number: number, ref: string, title: string, mergedAt: string | null, labels = admin) => ({
  number,
  title,
  html_url: `https://github.com/x/pull/${number}`,
  merged_at: mergedAt,
  labels,
  head: { ref },
});

/** Фейковий fetch: GET за шляхом → тіло. */
function gh(routes: Record<string, unknown>): { gh: GitHub; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const path = String(input).replace("https://api.github.com/repos/Faust-11/SLIPSTREAM", "");
    calls.push(path);
    const hit = routes[path];
    if (hit === undefined) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200 });
  }) as typeof fetch;
  return { gh: new GitHub({ api: "https://api.github.com", repo: "Faust-11/SLIPSTREAM", token: "t" }, fetchImpl), calls };
}

describe("prKind — чия це правка", () => {
  it("правка редактора і фото — за гілкою історії", () => {
    expect(prKind("jerez-1997", { head: { ref: "admin/stories-jerez-1997-20261120-101500" }, title: "Історія · jerez-1997: текст" })).toBe("edit");
  });
  it("відкат — за гілкою revert і назвою з адресою історії", () => {
    expect(prKind("jerez-1997", { head: { ref: "admin/revert-20261120-101500" }, title: "Відкат: Історія · jerez-1997: текст" })).toBe("revert");
  });
  it("чужа історія, чужа гілка, схожа адреса — ні", () => {
    expect(prKind("jerez-1997", { head: { ref: "admin/stories-jerez-1997-20261120-101500" }, title: "x" })).toBe("edit"); // назва не важлива для правки
    expect(prKind("jerez", { head: { ref: "admin/stories-jerez-1997-20261120-101500" }, title: "x" })).toBeNull(); // префікс адреси
    expect(prKind("jerez-1997", { head: { ref: "admin/revert-20261120-101500" }, title: "Відкат: Історія · jerez-1997-b: текст" })).toBeNull();
    expect(prKind("jerez-1997", { head: { ref: "admin/revert-20261120-101500" }, title: "Відкат: Гонки: календар" })).toBeNull();
    expect(prKind("jerez-1997", { head: { ref: "feature/stories-jerez-1997-20261120-101500" }, title: "Історія · jerez-1997: x" })).toBeNull();
  });
  it("крапка в адресі не стає «будь-яким знаком» регулярного виразу", () => {
    expect(prKind("a.b", { head: { ref: "admin/stories-axb-20261120-101500" }, title: "x" })).toBeNull();
  });
});

describe("parsePatch", () => {
  it("розбирає ділянки, додані й прибрані рядки; порожній рядок і «без \\n» — контекст", () => {
    const lines = parsePatch("@@ -1,3 +1,3 @@\n зміст\n-старе\n+нове\n \n\\ No newline at end of file");
    expect(lines.map((l) => l.kind)).toEqual(["hunk", "ctx", "del", "add", "ctx", "ctx"]);
    expect(lines[1]!.text).toBe("зміст");
    expect(lines[2]!.text).toBe("старе");
    expect(lines[3]!.text).toBe("нове");
  });
  it("рядок, що сам починається з «+++» чи «--- », — це дані, а не заголовок (GitHub patch заголовків не має)", () => {
    expect(parsePatch("+++ x")[0]).toEqual({ kind: "add", text: "++ x" });
  });
});

describe("listVersions", () => {
  const list = [
    pr(5, "admin/stories-alpha-20261101-100000", "Історія · alpha: текст", "2026-11-01T10:30:00Z"),
    pr(7, "admin/revert-20261103-100000", "Відкат: Історія · alpha: текст", "2026-11-03T10:30:00Z"),
    pr(6, "admin/stories-beta-20261102-100000", "Історія · beta: текст", "2026-11-02T10:30:00Z"),
    pr(4, "admin/stories-alpha-20261031-100000", "Історія · alpha: закрито без злиття", null),
    pr(3, "admin/stories-alpha-20261030-100000", "Історія · alpha: без мітки", "2026-10-30T10:30:00Z", []),
  ];
  it("лише злиті, з міткою admin, цієї історії; новіші першими", async () => {
    const { gh: g } = gh({ "/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1": list });
    const v = await listVersions(g, "alpha");
    expect(v.map((x) => [x.number, x.kind])).toEqual([
      [7, "revert"],
      [5, "edit"],
    ]);
  });
});

describe("loadVersion", () => {
  const merged = pr(5, "admin/stories-alpha-20261101-100000", "Історія · alpha: текст", "2026-11-01T10:30:00Z");
  const files = [
    { filename: "public/img/stories/alpha/m1-800.webp", status: "added", additions: 0, deletions: 0 },
    { filename: "content/stories/alpha/uk.md", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-а\n+б" },
    { filename: "content/stories/alpha/story.json", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n x\n+y" },
  ];
  it("файли історії першими, зображення без патча — lines: null", async () => {
    const { gh: g } = gh({ "/pulls/5": merged, "/pulls/5/files?per_page=100": files });
    const d = await loadVersion(g, "alpha", 5);
    expect(d!.files.map((f) => [f.filename.split("/").pop(), f.story, f.lines === null])).toEqual([
      ["story.json", true, false],
      ["uk.md", true, false],
      ["m1-800.webp", false, true],
    ]);
  });
  it("PR іншої історії, не злитий чи без мітки — null (і файли не запитуються)", async () => {
    const other = gh({ "/pulls/5": merged });
    expect(await loadVersion(other.gh, "beta", 5)).toBeNull();
    expect(other.calls).toEqual(["/pulls/5"]);
    expect(await loadVersion(gh({ "/pulls/5": { ...merged, merged_at: null } }).gh, "alpha", 5)).toBeNull();
    expect(await loadVersion(gh({ "/pulls/5": { ...merged, labels: [] } }).gh, "alpha", 5)).toBeNull();
  });
});

describe("openStoryPrs: відкат історії теж блокує нові правки", () => {
  it("правка, фото й відкат цієї історії — так; чужі — ні", async () => {
    const open = [
      { ...pr(11, "admin/stories-alpha-20261120-100000", "Історія · alpha: текст", null), draft: true },
      pr(12, "admin/revert-20261120-110000", "Відкат: Історія · alpha: текст", null),
      pr(13, "admin/revert-20261120-120000", "Відкат: Історія · beta: текст", null),
      pr(14, "admin/stories-beta-20261120-100000", "Історія · beta: текст", null),
    ];
    const { gh: g } = gh({ "/pulls?state=open&per_page=100": open });
    expect((await openStoryPrs(g, "alpha")).map((p) => p.number)).toEqual([11, 12]);
  });
});
