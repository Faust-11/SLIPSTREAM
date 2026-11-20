import { describe, expect, it } from "vitest";
import { countdown } from "../countdown";
import { isClosed, normalizePicks, parsePrediction, parseRoundKey, picksProblem } from "../predictions";

const ten = (...first: (number | null)[]) => [...first, ...Array(10 - first.length).fill(null)];
const base = { year: 2026, round: 22, kind: "R", picks: ten(1, 2, 3), dnfTeam: null, allFinish: false };

describe("ключ етапу з рядка запиту", () => {
  it("приймає рік і етап", () => {
    expect(parseRoundKey("2026", "22")).toEqual({ year: 2026, round: 22 });
    expect(parseRoundKey(2026, 5)).toEqual({ year: 2026, round: 5 });
  });
  it("відкидає сміття й межі", () => {
    for (const [y, r] of [["26", "1"], ["2026", "0"], ["2026", "41"], ["2026", "1.5"], ["2026", "-1"], ["20x6", "1"], ["2026", ""], [undefined, "1"], ["2026", null], ["1949", "1"], ["2201", "1"], ["2026", "001"]]) {
      expect(parseRoundKey(y, r), `${y}/${r}`).toBeNull();
    }
  });
});

describe("слоти", () => {
  it("P1–P3 обов'язкові, решта може бути порожньою", () => {
    expect(picksProblem(ten(1, 2, 3))).toBeNull();
    expect(picksProblem(ten(1, 2, null))).toBe("required");
    expect(picksProblem(ten(null, 2, 3))).toBe("required");
    expect(picksProblem(ten(1, 2, 3, null, 5))).toBeNull(); // прогалини дозволені, як у play.picks_valid
  });
  it("повтор пілота і неправильна довжина", () => {
    expect(picksProblem(ten(1, 2, 1))).toBe("duplicate");
    expect(picksProblem([1, 2, 3])).toBe("count");
    expect(picksProblem([...ten(1, 2, 3), 4])).toBe("count");
  });
  it("normalizePicks: лише 10 слотів із id або null", () => {
    expect(normalizePicks(ten(1, 2, 3))).toEqual(ten(1, 2, 3));
    for (const bad of [null, "x", [], [1, 2, 3], ten(1, 2, 0), ten(1, 2, 1.5), ten(1, 2, "3" as unknown as number)]) expect(normalizePicks(bad)).toBeNull();
  });
});

describe("тіло POST /api/predictions", () => {
  it("коректна гонка з командою й кваліфікація", () => {
    expect(parsePrediction({ ...base, dnfTeam: 191 })).toEqual({ ok: true, value: { ...base, dnfTeam: 191 } });
    expect(parsePrediction({ ...base, kind: "Q" })).toEqual({ ok: true, value: { ...base, kind: "Q" } });
  });
  it("«усі фінішують» без команди; поля extras необов'язкові", () => {
    expect(parsePrediction({ ...base, allFinish: true })).toMatchObject({ ok: true });
    const { dnfTeam: _a, allFinish: _b, ...bare } = base;
    expect(parsePrediction(bare)).toEqual({ ok: true, value: base });
  });
  it("кваліфікація не приймає «команду без фінішу» і «усі фінішують»", () => {
    expect(parsePrediction({ ...base, kind: "Q", dnfTeam: 191 })).toEqual({ ok: false, problem: "bad_extras" });
    expect(parsePrediction({ ...base, kind: "Q", allFinish: true })).toEqual({ ok: false, problem: "bad_extras" });
  });
  it("команда й «усі фінішують» разом — суперечність", () => {
    expect(parsePrediction({ ...base, dnfTeam: 191, allFinish: true })).toEqual({ ok: false, problem: "bad_extras" });
  });
  it("типи extras", () => {
    for (const bad of [{ dnfTeam: "191" }, { dnfTeam: 0 }, { dnfTeam: 1.5 }, { dnfTeam: -2 }, { allFinish: "yes" }, { allFinish: 1 }]) {
      expect(parsePrediction({ ...base, ...bad }), JSON.stringify(bad)).toEqual({ ok: false, problem: "bad_extras" });
    }
  });
  it("вид, слоти, ключ етапу", () => {
    expect(parsePrediction({ ...base, kind: "S" })).toEqual({ ok: false, problem: "bad_kind" });
    expect(parsePrediction({ ...base, kind: undefined })).toEqual({ ok: false, problem: "bad_kind" });
    expect(parsePrediction({ ...base, picks: ten(1, 2) })).toEqual({ ok: false, problem: "bad_picks" });
    expect(parsePrediction({ ...base, picks: ten(1, 2, 2) })).toEqual({ ok: false, problem: "bad_picks" });
    expect(parsePrediction({ ...base, picks: ten(1, 2, null) })).toEqual({ ok: false, problem: "bad_picks" });
    expect(parsePrediction({ ...base, picks: ten(1, 2, 3.5) })).toEqual({ ok: false, problem: "bad_picks" });
    expect(parsePrediction({ ...base, picks: "1,2,3" })).toEqual({ ok: false, problem: "bad_picks" });
    expect(parsePrediction({ ...base, round: 99 })).toEqual({ ok: false, problem: "bad_request" });
    expect(parsePrediction({ ...base, year: "2026x" })).toEqual({ ok: false, problem: "bad_request" });
    expect(parsePrediction(null)).toEqual({ ok: false, problem: "bad_request" });
  });
  it("зайві поля тіла не потрапляють у значення", () => {
    const res = parsePrediction({ ...base, userId: "someone-else", email: "x@y.z" });
    expect(res).toEqual({ ok: true, value: base });
  });
});

describe("дедлайн за годинником сервера", () => {
  it("невідомий дедлайн — закрито; рівно в момент дедлайну — закрито", () => {
    expect(isClosed(null, 0)).toBe(true);
    expect(isClosed(1000, 999)).toBe(false);
    expect(isClosed(1000, 1000)).toBe(true);
    expect(isClosed(1000, 1001)).toBe(true);
  });
});

describe("відлік", () => {
  const m = 60_000;
  it("uk", () => {
    expect(countdown(5 * 1440 * m + 3 * 60 * m + 20 * 1000, "uk").text).toBe("5 дн. 3 год");
    expect(countdown(2 * 1440 * m, "uk").text).toBe("2 дн.");
    expect(countdown(2 * 60 * m + 15 * m, "uk").text).toBe("2 год 15 хв");
    expect(countdown(3 * 60 * m, "uk").text).toBe("3 год");
    expect(countdown(12 * m + 59_000, "uk").text).toBe("12 хв");
    expect(countdown(59_999, "uk").text).toBe("менше хвилини");
  });
  it("en", () => {
    expect(countdown(26 * 60 * m, "en").text).toBe("1 d 2 h");
    expect(countdown(90 * m, "en").text).toBe("1 h 30 min");
    expect(countdown(0, "en").text).toBe("under a minute");
  });
  it("від'ємне значення — нуль, без «-1 хв»", () => {
    expect(countdown(-5 * m, "uk")).toEqual({ days: 0, hours: 0, minutes: 0, text: "менше хвилини" });
  });
});
