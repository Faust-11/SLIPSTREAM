import { describe, expect, it } from "vitest";
import { checkLap, minTicks, MAX_INPUT_CHARS, parseLapBody } from "../lap-check";
import { TPS, TRACK_KEYS, TRACK_SPECS } from "../physics";

describe("checkLap — повтор заїзду на сервері", () => {
  it.each(TRACK_KEYS)("%s: ввід бота-еталона дає його час без штрафів", (k) => {
    const r = checkLap(k, TRACK_SPECS[k].botInputs, false);
    expect(r).toEqual({ ok: true, ticks: TRACK_SPECS[k].botTicks, pen: 0, jump: false });
  });
  it("фальстарт додає секунду (120 тіків), як у грі", () => {
    const k = TRACK_KEYS[0];
    const r = checkLap(k, TRACK_SPECS[k].botInputs, true);
    expect(r).toMatchObject({ ok: true, ticks: TRACK_SPECS[k].botTicks + TPS, jump: true });
  });
  it("обірваний ввід — не фініш", () => {
    const k = TRACK_KEYS[0];
    const half = TRACK_SPECS[k].botInputs.split(",").slice(0, 40).join(",");
    expect(checkLap(k, half, false)).toEqual({ ok: false, problem: "unfinished" });
  });
  it("порожній газ 10 хвилин — не фініш; довший за 10 хвилин — зіпсований ввід", () => {
    expect(checkLap("lyman", "0.72000", false)).toEqual({ ok: false, problem: "unfinished" });
    expect(checkLap("lyman", "0.72001", false)).toEqual({ ok: false, problem: "bad_inputs" });
  });
  it("зіпсований RLE відхиляється без винятку", () => {
    for (const bad of ["1.x", "g.5", "1.5,", "1.5;2.5", "10.5", "1."]) expect(checkLap("lyman", bad, false)).toEqual({ ok: false, problem: "bad_inputs" });
  });
  it("нижня межа часу: довжина / 78,3 м/с — 52–64 % часу бота на кожній трасі (замір 21.11)", () => {
    for (const k of TRACK_KEYS) {
      const ratio = minTicks(k) / TRACK_SPECS[k].botTicks;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(0.66);
    }
  });
});

describe("parseLapBody — форма тіла", () => {
  const ok = { track: "lyman", inputs: "1.100,0.20", jump: true };
  it("приймає коректне тіло; час від клієнта ігнорується (його в результаті немає)", () => {
    const r = parseLapBody({ ...ok, ticks: 1, total: 1, time: 1 });
    expect(r).toEqual({ ok: true, track: "lyman", inputs: "1.100,0.20", jump: true });
    expect(Object.keys(r)).not.toContain("ticks");
  });
  it("jump лише булевий true; решта — false", () => {
    expect(parseLapBody({ ...ok, jump: "true" })).toMatchObject({ jump: false });
    expect(parseLapBody({ ...ok, jump: 1 })).toMatchObject({ jump: false });
    expect(parseLapBody({ track: "lyman", inputs: "1.5" })).toMatchObject({ jump: false });
  });
  it("відхиляє невідому трасу, не-рядок, порожній, завеликий і зі сторонніми символами", () => {
    expect(parseLapBody(null)).toEqual({ ok: false, problem: "bad_track" });
    expect(parseLapBody({ ...ok, track: "monza" })).toEqual({ ok: false, problem: "bad_track" });
    expect(parseLapBody({ ...ok, track: ["lyman"] })).toEqual({ ok: false, problem: "bad_track" });
    for (const inputs of [undefined, 5, "", "A.1", "1.1 ", "1.1\n", "1.1'; drop", "1".repeat(MAX_INPUT_CHARS + 1)]) {
      expect(parseLapBody({ ...ok, inputs })).toEqual({ ok: false, problem: "bad_inputs" });
    }
  });
});
