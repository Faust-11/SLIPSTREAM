import { describe, expect, it } from "vitest";
import { DEADLINE_LEAD_MS, deadlineOf } from "../predictions";

const sessions = (...s: { kind: string; at: string | null; real: boolean }[]) => ({ sessions: s as Parameters<typeof deadlineOf>[0]["sessions"] });

describe("deadlineOf — дедлайн за розкладом календаря", () => {
  it("старт кваліфікації Q1 мінус 5 хвилин (як play.deadline)", () => {
    expect(DEADLINE_LEAD_MS).toBe(300_000);
    expect(deadlineOf(sessions({ kind: "Q1", at: "2026-11-28T18:00:00+00:00", real: true }))).toBe("2026-11-28T17:55:00.000Z");
    expect(deadlineOf(sessions({ kind: "FP1", at: "2026-11-27T13:30:00+00:00", real: true }, { kind: "Q1", at: "2026-12-05T14:00:00+00:00", real: true }))).toBe("2026-12-05T13:55:00.000Z");
  });
  it("спринт-квалифікація (SQ1) дедлайном не є — лише головна Q1", () => {
    expect(deadlineOf(sessions({ kind: "SQ1", at: "2026-05-22T15:30:00+00:00", real: true }))).toBeNull();
  });
  it("час не «справжній» (лише дата) або невідомий — дедлайну немає, прогнози закриті", () => {
    expect(deadlineOf(sessions({ kind: "Q1", at: "2027-03-14T00:00:00+00:00", real: false }))).toBeNull();
    expect(deadlineOf(sessions({ kind: "Q1", at: null, real: true }))).toBeNull();
    expect(deadlineOf(sessions())).toBeNull();
  });
});
