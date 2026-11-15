// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeDecision } from "../admin-paths.mjs";

const PR = {
  headRefName: "admin/photos-20261115-142233",
  baseRefName: "main",
  headRefOid: "abc",
  isDraft: false,
  isCrossRepository: false,
  state: "OPEN",
  labels: [{ name: "admin" }],
};
const FILES = [
  { filename: "src/data/curated/teams.json", status: "modified" },
  { filename: "public/img/cars/cadillac-480.webp", status: "added" },
];

describe("mergeDecision — автозлиття лише контенту", () => {
  it("гілка admin/* у main, мітка, не чернетка, той самий коміт, лише контент — зливаємо", () => {
    expect(mergeDecision({ pr: PR, files: FILES, testedSha: "abc" })).toEqual({ ok: true, reason: "лише контент, CI зелений" });
  });

  it.each([
    ["закритий", { state: "CLOSED" }, "не відкритий"],
    ["не в main", { baseRefName: "release" }, "не в main"],
    ["не admin/*", { headRefName: "phase7/admin" }, "не admin"],
    ["з форку", { isCrossRepository: true }, "форку"],
    ["чернетка", { isDraft: true }, "чернетка"],
    ["без мітки", { labels: [] }, "мітки"],
    ["новий коміт після CI", { headRefOid: "def" }, "нові коміти"],
  ])("PR %s — ні", (_, patch, reason) => {
    const res = mergeDecision({ pr: { ...PR, ...patch }, files: FILES, testedSha: "abc" });
    expect(res).toMatchObject({ ok: false });
    expect(res.reason).toContain(reason);
  });

  it.each([
    ["без файлів", [], "немає"],
    ["код поруч із контентом", [...FILES, { filename: "src/proxy.ts", status: "modified" }], "src/proxy.ts"],
    ["workflow", [{ filename: ".github/workflows/admin-merge.yml", status: "modified" }], "поза контентом"],
    // gh pr view --json files бачив би лише новий шлях; REST віддає і старий.
    ["перейменування коду в контент", [{ filename: "public/img/cars/x.webp", previous_filename: "src/proxy.ts", status: "renamed" }], "src/proxy.ts"],
    ["копіювання", [{ filename: "public/img/cars/x.webp", status: "copied" }], "copied"],
    ["SVG (можливий XSS)", [{ filename: "public/img/circuits/monza.svg", status: "added" }], "monza.svg"],
    ["100 файлів", Array.from({ length: 100 }, (_, i) => ({ filename: `public/img/cars/c${i}.webp`, status: "added" })), "забагато"],
  ])("файли: %s — ні", (_, files, reason) => {
    const res = mergeDecision({ pr: PR, files, testedSha: "abc" });
    expect(res).toMatchObject({ ok: false });
    expect(res.reason).toContain(reason);
  });

  it("перейменування в межах контенту — так", () => {
    const files = [{ filename: "public/img/cars/new-480.webp", previous_filename: "public/img/cars/old-480.webp", status: "renamed" }];
    expect(mergeDecision({ pr: PR, files, testedSha: "abc" }).ok).toBe(true);
  });

  it("CLI workflow: 0 — зливати, 1 — ні (зокрема зіпсовані дані)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const run = (pr: unknown, files: unknown) => {
      writeFileSync(join(dir, "pr.json"), JSON.stringify(pr));
      writeFileSync(join(dir, "files.json"), typeof files === "string" ? files : JSON.stringify(files));
      try {
        execFileSync("node", ["scripts/admin/merge-gate.mjs", "abc", join(dir, "pr.json"), join(dir, "files.json")], { stdio: "pipe" });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(run(PR, FILES)).toBe(0);
    expect(run(PR, [{ filename: "package.json", status: "modified" }])).toBe(1);
    expect(run(PR, "{not json")).toBe(1);
  });
});
