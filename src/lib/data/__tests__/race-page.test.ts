import { describe, expect, it, vi } from "vitest";
import { gapTime, lapTime, raceTime } from "@/lib/race-math";
import { getRaceKeys, getRacePage, statusOf } from "../race-page";

vi.mock("@/lib/data/db", async () => {
  const fx = await import("@/lib/data/__tests__/db-fixture");
  return { dbSelect: fx.dbSelect, dbSelectAll: fx.dbSelect };
});

const race = async (y: number, r: number, l: "uk" | "en" = "uk") => (await getRacePage(y, r, l))!;

describe("формати часу", () => {
  it("коло, гонка, відрив", () => {
    expect(lapTime(82207)).toBe("1:22.207");
    expect(lapTime(9407)).toBe("9.407");
    expect(raceTime(5167469)).toBe("1:26:07.469");
    expect(gapTime(12594)).toBe("+12.594");
    expect(gapTime(61800)).toBe("+1:01.800");
  });
  it("статуси результату — з коду бази (0001)", () => {
    expect([0, 1, 10, 11, 20, 30, 40, 41, 99].map(statusOf)).toEqual(["finished", "lapped", "accident", "retired", "dsq", "dns", "dnq", "dnq", "retired"]);
  });
});

describe("getRacePage — Абу-Дабі 2025 (еталон — макет)", () => {
  it("смуга: переміг Ферстаппен з поулу; вирішальна гонка — чемпіон Норріс", async () => {
    const p = await race(2025, 24);
    expect(p.strip.winners.map((w) => w.id)).toEqual(["max_verstappen"]);
    expect(p.strip.poles.map((d) => d.id)).toEqual(["max_verstappen"]);
    expect(p.decider).toBe(true);
    expect(p.strip.champion?.id).toBe("norris");
    expect([p.place, p.gp, p.rounds]).toEqual(["Абу-Дабі", "Гран-прі Абу-Дабі", 24]);
  });

  it("«як вирішився титул»: 408→423 (P3), 396→421 (P1), 392→410 (P2); з P4 — 420 проти 421 Ферстаппена", async () => {
    const { title } = await race(2025, 24);
    expect(title!.contenders.map((c) => [c.driver.id, c.before, c.after, c.finish])).toEqual([
      ["norris", 408, 423, 3],
      ["max_verstappen", 396, 421, 1],
      ["piastri", 392, 410, 2],
    ]);
    expect(title!.lower).toMatchObject({ position: 4, driver: { id: "max_verstappen" }, would: 420, rival: 421 });
  });

  it("коло за колом: Ферстаппен лідирував на всіх колах, крім 24–40; Норріс після піт-стопу на 16-му — 9-й, фініш 3-й", async () => {
    const { lapChart } = await race(2025, 24);
    expect(lapChart!.laps).toBe(58);
    expect(lapChart!.notLed).toEqual([{ from: 24, to: 40 }]);
    expect(lapChart!.drop).toMatchObject({ driver: { id: "norris" }, position: 9, finish: 3, stopLap: 16 });
    expect(lapChart!.lines.slice(0, 3).map((l) => l.driver.id)).toEqual(["max_verstappen", "piastri", "norris"]);
  });

  it("протокол: час переможця 1:26:07.469, Піастрі +12.594, по одному піт-стопу; кваліфікація — поул 1:22.207", async () => {
    const p = await race(2025, 24);
    expect(p.race[0]!.time).toEqual({ kind: "total", ms: 5167469 });
    expect(p.race[1]).toMatchObject({ driver: { id: "piastri" }, time: { kind: "gap", ms: 12594 }, stops: 1, grid: 3 });
    expect(p.quali[0]).toMatchObject({ position: 1, driver: { id: "max_verstappen" }, q3: 82207 });
    expect(p.race.filter((r) => r.position !== null)).toHaveLength(20);
  });

  it("вікенд: перше тренування — Норріс 1:24.485; кваліфікація — поул Ферстаппена; сусіди — Лусаїл, наступного немає", async () => {
    const p = await race(2025, 24);
    const fp1 = p.sessions.find((s) => s.kind === "FP1")!;
    expect([fp1.best?.driver.id, fp1.best?.ms, fp1.real]).toEqual(["norris", 84485, true]);
    expect(p.sessions.find((s) => s.kind === "Q")!.best).toMatchObject({ driver: { id: "max_verstappen" }, ms: 82207 });
    expect(p.prev).toEqual({ year: 2025, round: 23, place: "Лусаїл" });
    expect(p.next).toBeNull();
  });
});

describe("getRacePage — межові гонки", () => {
  it("1988 Сузука — вирішальна; «на місце нижче» не рахуємо (зараховувались 11 кращих)", async () => {
    const p = await race(1988, 15);
    expect(p.decider).toBe(true);
    expect(p.title!.lower).toBeNull();
    expect(p.strip.champion?.id).toBe("senna");
  });

  it("1952 Італія — після виправлення поул лише Аскарі, Мосс стартував 9-м", async () => {
    const p = await race(1952, 8);
    expect(p.strip.poles.map((d) => d.id)).toEqual(["ascari"]);
    expect(p.race.find((r) => r.driver.id === "moss")?.grid).toBe(9);
    expect(p.lapChart).toBeNull();
    expect(p.quali).toEqual([]);
  });

  it("сторінка на кожну гонку з результатами; невідомий етап — null", async () => {
    expect((await getRaceKeys()).length).toBe(1169);
    expect(await getRacePage(2025, 99, "uk")).toBeNull();
  });

  it("англійською — назви англійською", async () => {
    const p = await race(2025, 24, "en");
    expect([p.place, p.gp]).toEqual(["Abu Dhabi", "Abu Dhabi Grand Prix"]);
  });
});

describe("тексти «коло за колом»", () => {
  it("Абу-Дабі 2021: Ферстаппен лідирував лише на останньому колі (58)", async () => {
    const lc = (await race(2021, 22)).lapChart!;
    expect(lc.led).toEqual([{ from: 58, to: 58 }]);
    expect(lc.notLed).toEqual([{ from: 1, to: 57 }]);
  });
});
