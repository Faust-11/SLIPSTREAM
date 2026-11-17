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
