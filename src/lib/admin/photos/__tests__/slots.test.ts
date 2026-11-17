// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planFormat } from "../formats";
import { CURATED, applySlot, formatsFor, jsonFor, type RenderedSet, type Target } from "../slots";

const C = { x: 0.5, y: 0.4 };
const CREDIT = { page: "https://commons.wikimedia.org/wiki/File:New.jpg", author: "New Author", license: "CC BY-SA 4.0" };
const read = (paths: string[]) => Object.fromEntries(paths.map((p) => [p, readFileSync(p, "utf8")]));

/** Нарізка без sharp: розміри з planFormat для джерела 1600×1200, дані — 1 байт. */
function sets(t: Target): RenderedSet[] {
  return formatsFor(t).map((f) => ({ role: f.role, format: f.format, variants: planFormat(f.format, 1600, 1200, f.base, C).variants.map((v) => ({ ...v, data: new Uint8Array([1]) })) }));
}

/** Змінені рядки JSON (diff по рядках) — щоб правка не переписувала файл цілком. */
function changedLines(before: string, after: string): number {
  const a = before.split("\n");
  const b = after.split("\n");
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j;
}

function run(t: Target) {
  const current = read(jsonFor(t));
  const changes = applySlot(t, sets(t), CREDIT, C, current);
  const json = Object.fromEntries(changes.filter((c) => c.path.endsWith(".json")).map((c) => [c.path, (c as { content: string }).content]));
  const images = changes.filter((c) => c.path.startsWith("public/")).map((c) => c.path);
  return { current, json, images };
}

describe("слоти на справжніх даних репозиторію", () => {
  it("пілот, обидва: аватар 96 + банер 420/640, ручний портрет, ширини, без окремого автора банера; мало рядків", () => {
    const { current, json, images } = run({ kind: "driver", ref: "hawthorn", part: "both" });
    expect(images).toEqual(["public/img/drivers/hawthorn-96.webp", "public/img/drivers/hawthorn-420.webp", "public/img/drivers/hawthorn-640.webp"]);
    const p = JSON.parse(json[CURATED.portraits]!).drivers.hawthorn;
    expect(p.manual).toEqual({ avatar: "/img/drivers/hawthorn-96.webp", credit: CREDIT });
    expect(p.heroCredit).toBeUndefined();
    expect(JSON.parse(json[CURATED.heroes]!).drivers.hawthorn).toEqual([420, 640]);
    expect(changedLines(current[CURATED.portraits]!, json[CURATED.portraits]!)).toBeLessThan(15);
    expect(changedLines(current[CURATED.heroes]!, json[CURATED.heroes]!)).toBeLessThan(8);
  });

  it("поточний пілот, лише аватар: новий автор і в drivers.json; банер зберігає старого автора", () => {
    const before = JSON.parse(readFileSync(CURATED.drivers, "utf8")).drivers.albon;
    const { json, images } = run({ kind: "driver", ref: "albon", part: "card" });
    expect(images).toEqual(["public/img/drivers/albon-96.webp"]);
    expect(JSON.parse(json[CURATED.drivers]!).drivers.albon.credit).toEqual(CREDIT);
    expect(JSON.parse(json[CURATED.portraits]!).drivers.albon.heroCredit).toEqual(before.credit);
    expect(json[CURATED.heroes]).toBeUndefined();
  });

  it("пілот, лише банер: окремий автор банера, аватар не чіпаємо", () => {
    const { json, images } = run({ kind: "driver", ref: "senna", part: "hero" });
    expect(images).toEqual(["public/img/drivers/senna-420.webp", "public/img/drivers/senna-640.webp"]);
    const p = JSON.parse(json[CURATED.portraits]!).drivers.senna;
    expect(p.heroCredit).toEqual(CREDIT);
    expect(p.manual.credit).not.toEqual(CREDIT);
  });

  it("команда, лише картка: 480/256, srcSet за зростанням як у даних; банер — зі старим автором", () => {
    const old = JSON.parse(readFileSync(CURATED.teams, "utf8")).teams.find((x: { id: string }) => x.id === "ferrari");
    const { json, images } = run({ kind: "team", id: "ferrari", part: "card" });
    expect(images).toEqual(["public/img/cars/ferrari-480.webp", "public/img/cars/ferrari-256.webp"]);
    const t = JSON.parse(json[CURATED.teams]!).teams.find((x: { id: string }) => x.id === "ferrari");
    expect(t.photo).toEqual({ src: "/img/cars/ferrari-480.webp", srcSet: old.photo.srcSet, width: 480, height: 300, credit: CREDIT });
    expect(t.hero.credit).toEqual(old.photo.credit);
  });

  it("сезон, обидва: картка full/small + банер з focusY; автор сезону — новий", () => {
    const { json, images } = run({ kind: "season", year: "1958", part: "both" });
    expect(images[0]).toBe("public/img/seasons/1958-full.webp");
    expect(images).toContain("public/img/seasons/1958-hero-1280.webp");
    const s = JSON.parse(json[CURATED.seasons]!).seasons["1958"];
    expect(s.credit).toEqual(CREDIT);
    expect(s.hero).toMatchObject({ src: "/img/seasons/1958-hero-1280.webp", width: 1280, height: 960, focusY: 40 });
    expect(s.hero.credit).toBeUndefined();
  });

  it("банер гонки: race-photos.json, ключі за порядком етапів", () => {
    const { json, images } = run({ kind: "race", key: "2026/20" });
    expect(images).toEqual(["public/img/races/2026-20-hero-1280.webp", "public/img/races/2026-20-hero-800.webp", "public/img/races/2026-20-hero-480.webp"]);
    expect(JSON.parse(json[CURATED.racePhotos]!).photos["2026/20"]).toMatchObject({ src: "/img/races/2026-20-hero-1280.webp", credit: CREDIT });
  });

  it("незнайомий ідентифікатор чи шлях-атака — помилка", () => {
    expect(() => formatsFor({ kind: "driver", ref: "../../etc", part: "both" })).toThrow();
    expect(() => formatsFor({ kind: "race", key: "2026/../1" })).toThrow();
    expect(() => run({ kind: "team", id: "no-such-team", part: "both" })).toThrow("немає команди");
  });
});

describe("removeSlot — зняти за запитом автора (на справжніх даних)", () => {
  const cur = (t: Target) => read(jsonFor(t));
  const paths = (c: { path: string }[]) => c.map((x) => x.path);

  it("поточний пілот (обидва): аватар і банер (420+640, якщо є) видалено, drivers.json — без аватара", async () => {
    const { removeSlot } = await import("../slots");
    const t: Target = { kind: "driver", ref: "albon", part: "both" };
    const heroes = JSON.parse(readFileSync(CURATED.heroes, "utf8")).drivers.albon as number[];
    const ch = removeSlot(t, cur(t));
    expect(paths(ch).filter((p) => p.startsWith("public/"))).toEqual(["public/img/drivers/albon-96.webp", "public/img/drivers/albon-420.webp", ...(heroes.length > 1 ? ["public/img/drivers/albon-640.webp"] : [])]);
    const drivers = JSON.parse((ch.find((c) => c.path === CURATED.drivers) as { content: string }).content).drivers.albon;
    expect([drivers.avatar, drivers.credit]).toEqual([null, null]);
    expect(JSON.parse((ch.find((c) => c.path === CURATED.heroes) as { content: string }).content).drivers.albon).toBeUndefined();
  });

  it("пілот з банером лише 420 — видаляємо лише 420", async () => {
    const { removeSlot } = await import("../slots");
    const h = JSON.parse(readFileSync(CURATED.heroes, "utf8")).drivers as Record<string, number[]>;
    const ref = Object.keys(h).find((k) => h[k]!.length === 1)!;
    const t: Target = { kind: "driver", ref, part: "hero" };
    expect(paths(removeSlot(t, cur(t))).filter((p) => p.endsWith(".webp"))).toEqual([`public/img/drivers/${ref}-420.webp`]);
  });

  it("команда — завжди і картка, і банер; сезон без банера — лише картка", async () => {
    const { removeSlot } = await import("../slots");
    const team: Target = { kind: "team", id: "ferrari", part: "card" };
    expect(paths(removeSlot(team, cur(team))).filter((p) => p.endsWith(".webp"))).toHaveLength(5);
    const s = JSON.parse(readFileSync(CURATED.seasons, "utf8")).seasons as Record<string, { hero?: unknown }>;
    const year = Object.keys(s).find((y) => !s[y]!.hero)!;
    const season: Target = { kind: "season", year, part: "both" };
    expect(paths(removeSlot(season, cur(season))).filter((p) => p.endsWith(".webp"))).toEqual([`public/img/seasons/${year}-full.webp`, `public/img/seasons/${year}-small.webp`]);
  });

  it("гонка без свого банера / траса без фото — зрозуміла відмова", async () => {
    const { removeSlot } = await import("../slots");
    const race: Target = { kind: "race", key: "2026/20" };
    expect(() => removeSlot(race, cur(race))).toThrow("немає свого банера");
  });
});

describe("removeSlot — нічого знімати", () => {
  it("сезон без банера, «лише банер» — помилка, а не порожній PR", async () => {
    const { NothingToRemove, removeSlot } = await import("../slots");
    const s = JSON.parse(readFileSync(CURATED.seasons, "utf8")).seasons as Record<string, { hero?: unknown }>;
    const year = Object.keys(s).find((y) => !s[y]!.hero)!;
    const t: Target = { kind: "season", year, part: "hero" };
    expect(() => removeSlot(t, read(jsonFor(t)))).toThrow(NothingToRemove);
  });
});

describe("ручний аватар під іншою назвою (Senna — senna-manual-96.webp)", () => {
  it("зняти — видаляє саме файл, на який посилається запис", async () => {
    const { removeSlot } = await import("../slots");
    const t: Target = { kind: "driver", ref: "senna", part: "both" };
    const manual = JSON.parse(readFileSync(CURATED.portraits, "utf8")).drivers.senna.manual.avatar as string;
    expect(manual).toBe("/img/drivers/senna-manual-96.webp");
    expect(removeSlot(t, read(jsonFor(t))).map((c) => c.path)).toContain("public/img/drivers/senna-manual-96.webp");
  });
  it("замінити — старий ручний файл видаляється (не лишається сиротою)", () => {
    const t: Target = { kind: "driver", ref: "senna", part: "card" };
    const ch = applySlot(t, sets(t), CREDIT, C, read(jsonFor(t)));
    expect(ch.find((c) => c.path === "public/img/drivers/senna-manual-96.webp")).toMatchObject({ content: null });
  });
});
