// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeDecision, requiredChecks } from "../admin-paths.mjs";

const PR = {
  headRefName: "admin/photos-20261115-142233",
  baseRefName: "main",
  headRefOid: "abc",
  isDraft: false,
  isCrossRepository: false,
  state: "OPEN",
  labels: [{ name: "admin" }],
};
const CHECKS = {
  total_count: 3,
  check_runs: [
    { name: "check", status: "completed", conclusion: "success" },
    { name: "lighthouse", status: "completed", conclusion: "success" },
    { name: "db", status: "completed", conclusion: "success" },
  ],
};
const STATUS = { statuses: [{ context: "Vercel", state: "success" }] };
const FILES = [
  { filename: "src/data/curated/teams.json", status: "modified" },
  { filename: "public/img/cars/cadillac-480.webp", status: "added" },
];

describe("mergeDecision — автозлиття лише контенту", () => {
  it("гілка admin/* у main, мітка, не чернетка, той самий коміт, лише контент — зливаємо", () => {
    expect(mergeDecision({ pr: PR, files: FILES, checks: CHECKS, status: STATUS, testedSha: "abc" })).toEqual({ ok: true, reason: "лише контент, усі перевірки зелені" });
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
    const res = mergeDecision({ pr: { ...PR, ...patch }, files: FILES, checks: CHECKS, status: STATUS, testedSha: "abc" });
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
    const res = mergeDecision({ pr: PR, files, checks: CHECKS, status: STATUS, testedSha: "abc" });
    expect(res).toMatchObject({ ok: false });
    expect(res.reason).toContain(reason);
  });

  it("перейменування в межах контенту — так", () => {
    const files = [{ filename: "public/img/cars/new-480.webp", previous_filename: "public/img/cars/old-480.webp", status: "renamed" }];
    expect(mergeDecision({ pr: PR, files, checks: CHECKS, status: STATUS, testedSha: "abc" }).ok).toBe(true);
  });

  const run = (name: string, status: string, conclusion: string | null) => ({ name, status, conclusion });
  it.each([
    ["DB червоний (seed --strict)", { ...CHECKS, check_runs: [...CHECKS.check_runs.slice(0, 2), run("db", "completed", "failure")] }, STATUS, "db"],
    ["Lighthouse ще йде", { total_count: 2, check_runs: [...CHECKS.check_runs.slice(0, 1), run("lighthouse", "in_progress", null)] }, STATUS, "ще йдуть"],
    ["Vercel не зібрав прев'ю", CHECKS, { statuses: [{ context: "Vercel", state: "failure" }] }, "Vercel"],
    ["Vercel ще збирає", CHECKS, { statuses: [{ context: "Vercel", state: "pending" }] }, "Vercel"],
    ["перевірок немає", { total_count: 0, check_runs: [] }, STATUS, "check (немає успішної)"],
    ["Lighthouse ще навіть не з'явився", { total_count: 2, check_runs: [CHECKS.check_runs[0]!, CHECKS.check_runs[2]!] }, STATUS, "lighthouse (немає успішної)"],
    ["DB пропущено, а curated змінено", { ...CHECKS, check_runs: [...CHECKS.check_runs.slice(0, 2), run("db", "completed", "skipped")] }, STATUS, "db (немає успішної)"],
    ["статусу Vercel ще немає", CHECKS, { statuses: [] }, "Vercel"],
    ["не всі перевірки на сторінці", { ...CHECKS, total_count: 150 }, STATUS, "не всі"],
  ])("%s — ні", (_, checks, status, reason) => {
    const res = mergeDecision({ pr: PR, files: FILES, checks, status, testedSha: "abc" });
    expect(res).toMatchObject({ ok: false });
    expect(res.reason).toContain(reason);
  });

  it("CLI workflow: 0 — зливати, 1 — ні (зокрема зіпсовані дані)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const cli = (pr: unknown, files: unknown) => {
      writeFileSync(join(dir, "pr.json"), JSON.stringify(pr));
      writeFileSync(join(dir, "files.json"), typeof files === "string" ? files : JSON.stringify(files));
      writeFileSync(join(dir, "checks.json"), JSON.stringify(CHECKS));
      writeFileSync(join(dir, "status.json"), JSON.stringify(STATUS));
      try {
        const args = ["pr", "files", "checks", "status"].map((f) => join(dir, `${f}.json`));
        execFileSync("node", ["scripts/admin/merge-gate.mjs", "abc", ...args], { stdio: "pipe" });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(cli(PR, FILES)).toBe(0);
    expect(cli(PR, [{ filename: "package.json", status: "modified" }])).toBe(1);
    expect(cli(PR, "{not json")).toBe(1);
  });
});

describe("requiredChecks — за тригерами workflow", () => {
  it("лише тексти історій (*.md) — тільки CI; curated — ще DB і Lighthouse; webp — CI і Lighthouse", () => {
    expect(requiredChecks([{ filename: "content/stories/jerez-1997/uk.md" }])).toEqual(["check"]);
    expect(requiredChecks([{ filename: "src/data/curated/teams.json" }])).toEqual(["check", "db", "lighthouse"]);
    expect(requiredChecks([{ filename: "public/img/cars/a-480.webp" }])).toEqual(["check", "lighthouse"]);
    expect(requiredChecks([{ filename: "public/img/cars/a.webp", previous_filename: "src/data/curated/x.json" }])).toEqual(["check", "db", "lighthouse"]);
  });

  it("тригери в workflow не розійшлись із правилом", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(".github/workflows/db.yml", "utf8")).toContain('- "src/data/curated/**"');
    const lh = readFileSync(".github/workflows/lighthouse.yml", "utf8");
    expect(lh).toContain('- "**/*.md"');
    for (const ignored of lh.match(/paths-ignore:[\s\S]*?\n\s*\n|paths-ignore:[\s\S]*?workflow_dispatch/)![0].matchAll(/- "([^"]+)"/g)) {
      // Жоден ігнорований шаблон, крім *.md, не має накривати файли адмінки (json, webp).
      expect(["**/*.css", "e2e/**", "**/__tests__/**", "docs/**", "**/*.md", ".github/workflows/lighthouse.yml"]).toContain(ignored[1]);
    }
  });
});
