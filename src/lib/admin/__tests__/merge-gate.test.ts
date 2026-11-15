// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { mergeDecision } from "../admin-paths.mjs";

const OK_PR = {
  headRefName: "admin/photos-20261115-142233",
  headRefOid: "abc",
  isDraft: false,
  isCrossRepository: false,
  state: "OPEN",
  labels: [{ name: "admin" }],
  files: [{ path: "src/data/curated/teams.json" }, { path: "public/img/cars/cadillac-480.webp" }],
};

describe("mergeDecision — автозлиття лише контенту", () => {
  it("гілка admin/*, мітка, не чернетка, той самий коміт, лише контент — зливаємо", () => {
    expect(mergeDecision({ pr: OK_PR, testedSha: "abc" })).toEqual({ ok: true, reason: "лише контент, CI зелений" });
  });

  it.each([
    ["закритий", { state: "CLOSED" }, "не відкритий"],
    ["не admin/*", { headRefName: "phase7/admin" }, "не admin"],
    ["з форку", { isCrossRepository: true }, "форку"],
    ["чернетка", { isDraft: true }, "чернетка"],
    ["без мітки", { labels: [] }, "мітки"],
    ["новий коміт після CI", { headRefOid: "def" }, "нові коміти"],
    ["без файлів", { files: [] }, "немає"],
    ["код поруч із контентом", { files: [{ path: "src/data/curated/teams.json" }, { path: "src/proxy.ts" }] }, "src/proxy.ts"],
    ["workflow", { files: [{ path: ".github/workflows/admin-merge.yml" }] }, "поза контентом"],
    ["100 файлів", { files: Array.from({ length: 100 }, (_, i) => ({ path: `public/img/cars/c${i}.webp` })) }, "забагато"],
  ])("%s — ні", (_, patch, reason) => {
    const res = mergeDecision({ pr: { ...OK_PR, ...patch }, testedSha: "abc" });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain(reason);
  });

  it("CLI workflow: код виходу 0 — зливати, 1 — ні", () => {
    const run = (pr: unknown) => {
      try {
        execFileSync("node", ["scripts/admin/merge-gate.mjs", "abc"], { input: JSON.stringify(pr), stdio: ["pipe", "pipe", "pipe"] });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(run(OK_PR)).toBe(0);
    expect(run({ ...OK_PR, files: [{ path: "package.json" }] })).toBe(1);
  });
});
