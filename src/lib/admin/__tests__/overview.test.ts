// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attentionList, coverage, deployState, missingPortraits, raceLag, runLevel, storyTranslations } from "../overview";

const H = 3_600_000;
const now = Date.UTC(2026, 10, 22, 12);

describe("raceLag — етап мав фінішувати, а результату немає", () => {
  const cards = [
    { round: 20, gp: "Гран-прі Бразилії", state: "done" as const, raceAt: new Date(now - 14 * 24 * H).toISOString() },
    { round: 21, gp: "Гран-прі Лас-Вегаса", state: "next" as const, raceAt: new Date(now - 5 * H).toISOString() },
    { round: 22, gp: "Гран-прі Катару", state: "later" as const, raceAt: new Date(now + 7 * 24 * H).toISOString() },
  ];
  it("5 год після старту, результату немає — бракує етапу 21", () => {
    expect(raceLag(cards, now)).toEqual({ round: 21, gp: "Гран-прі Лас-Вегаса", hours: 5 });
  });
  it("3 год — ще рано", () => expect(raceLag(cards, now - 2 * H)).toBeNull());
  it("усе завантажено — null", () => expect(raceLag(cards.map((c) => ({ ...c, state: "done" as const })), now)).toBeNull());
});

describe("deployState — main на проді?", () => {
  const at = new Date(now - 20 * 60_000).toISOString();
  it("Vercel success — викладено", () => expect(deployState({ state: "success" }, at, now)).toEqual({ level: "ok", label: "Викладено" }));
  it("failure — збірка впала", () => expect(deployState({ state: "failure" }, at, now).level).toBe("bad"));
  it("10 хв без статусу — збирається", () => expect(deployState(null, new Date(now - 10 * 60_000).toISOString(), now).level).toBe("one"));
  it("20 хв без статусу (як 15.11 після 502) — збірка не почалась", () =>
    expect(deployState(null, at, now)).toEqual({ level: "bad", label: "Збірка не почалась" }));
  it("20 хв у pending — зависла", () => expect(deployState({ state: "pending" }, at, now).label).toBe("Збірка зависла"));
});

describe("coverage, missingPortraits, runLevel", () => {
  it("рахує наповнення", () => {
    expect(
      coverage(
        [{ avatar: "/a.webp" }, { avatar: null }],
        [{ photo: {} }, {}],
        ["monza", "spa", "reims"],
        { monza: {}, spa: {} },
        [{ en: true }, { en: false }],
      ),
    ).toEqual([
      { label: "Портрети пілотів", have: 1, total: 2 },
      { label: "Фото болідів команд", have: 1, total: 2 },
      { label: "Схеми трас", have: 2, total: 3 },
      { label: "Історії з перекладом EN", have: 1, total: 2 },
    ]);
  });
  it("без портрета: чемпіони поіменно, переможці й призери — числом", () => {
    const d = (name: string, titles: number, wins: number, podiums: number, avatar: string | null = null) => ({ name, titles, wins, podiums, avatar });
    expect(missingPortraits([d("Mike Hawthorn", 1, 3, 18), d("A", 0, 1, 2), d("B", 0, 0, 1), d("C", 0, 0, 0), d("Senna", 3, 41, 80, "/s.webp")])).toEqual({
      champions: ["Mike Hawthorn"],
      winners: 1,
      podiums: 1,
    });
  });
  it("runLevel", () => {
    expect(runLevel(null)).toBe("bad");
    expect(runLevel({ status: "in_progress", conclusion: null, at: "", url: "", sha: "a" })).toBe("one");
    expect(runLevel({ status: "completed", conclusion: "success", at: "", url: "", sha: "a" })).toBe("ok");
    expect(runLevel({ status: "completed", conclusion: "failure", at: "", url: "", sha: "a" })).toBe("bad");
  });
});

describe("attentionList", () => {
  const base = {
    now,
    site: { season: 2026, done: 20, total: 23, lastRace: "Гран-прі Бразилії", lag: null },
    coverage: [],
    portraits: { champions: [], winners: 0, podiums: 0 },
    github: null,
    githubError: false,
    dbError: false,
  };
  it("без GitHub — одне попередження з посиланням на Систему", () => {
    expect(attentionList(base)).toEqual([expect.objectContaining({ level: "one", title: "GitHub не підключено", href: "/admin/system" })]);
  });
  it("прод не зібрано, data-sync впав, етапу бракує, чемпіон без портрета", () => {
    const run = (conclusion: string) => ({ status: "completed", conclusion, at: "", url: "u", sha: "9b639f5abc" });
    const items = attentionList({
      ...base,
      site: { ...base.site, lag: { round: 21, gp: "Гран-прі Лас-Вегаса", hours: 5 } },
      portraits: { champions: ["Mike Hawthorn"], winners: 13, podiums: 43 },
      github: { main: { sha: "9b639f5abc", at: "", deploy: { level: "bad", label: "Збірка не почалась" } }, dataSync: run("failure"), ciMain: run("success"), journal: [], open: [] },
    });
    expect(items.map((i) => i.title)).toEqual([
      "Прод: збірка не почалась",
      "Синхронізація даних не пройшла",
      "Немає результату: етап 21",
      "Чемпіон без портрета: Mike Hawthorn",
    ]);
  });

  it("червоний CI старішого коміту (main злито автозлиттям без push-прогону) — не тривога; того самого — тривога", () => {
    const gh = (sha: string) => ({
      main: { sha: "new", at: "", deploy: { level: "ok" as const, label: "Викладено" } },
      dataSync: { status: "completed", conclusion: "success", at: "", url: "", sha: "x" },
      ciMain: { status: "completed", conclusion: "failure", at: "", url: "u", sha },
      journal: [],
      open: [],
    });
    expect(attentionList({ ...base, github: gh("old") })).toEqual([]);
    expect(attentionList({ ...base, github: gh("new") }).map((i) => i.title)).toEqual(["CI на main червоний"]);
  });

  it("база не відповідає — окрема тривога, Огляд не падає", () => {
    expect(attentionList({ ...base, dbError: true, github: null }).map((i) => i.title)).toContain("База не відповідає");
  });
});

describe("storyTranslations — з файлів, не з getStory", () => {
  it("історія без en.md рахується як неперекладена; без uk.md чи story.json — не історія", () => {
    const root = mkdtempSync(join(tmpdir(), "stories-"));
    const story = (slug: string, files: string[]) => {
      mkdirSync(join(root, slug));
      for (const f of files) writeFileSync(join(root, slug, f), "x");
    };
    story("full", ["story.json", "uk.md", "en.md"]);
    story("no-en", ["story.json", "uk.md"]);
    story("draft", ["uk.md"]);
    writeFileSync(join(root, "README.md"), "x");
    expect(storyTranslations(root).sort((a, b) => Number(a.en) - Number(b.en))).toEqual([{ en: false }, { en: true }]);
    expect(storyTranslations(join(root, "missing"))).toEqual([]);
  });
});
