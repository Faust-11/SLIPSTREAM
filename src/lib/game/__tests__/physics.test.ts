import { describe, expect, it } from "vitest";
import {
  IN_UP,
  TRACK_KEYS,
  TRACK_SPECS,
  TPS,
  buildTrack,
  fmtLap,
  fmtSec,
  isTrackKey,
  newCar,
  rle,
  sectorTimes,
  simulate,
  step,
  total,
  unrle,
  verifyLap,
} from "../physics";

// Еталон — макет «Гаряче коло» (заміряно в Node 24 15.11: бот фінішує рівно за ці тіки, без штрафів).
const BOT = { lyman: [3592, "0:29.933"], port: [4132, "0:34.433"], plateau: [4719, "0:39.325"], forest: [2820, "0:23.500"] } as const;

describe("бот — детермінований повтор", () => {
  for (const key of TRACK_KEYS) {
    it(`${key}: ${BOT[key][1]} без штрафів, 3 сектори по порядку`, () => {
      const tr = buildTrack(key);
      const r = simulate(tr, unrle(TRACK_SPECS[key].botInputs));
      expect(r.done).toBe(true);
      expect(r.pen).toBe(0);
      expect(total(r)).toBe(BOT[key][0]);
      expect(TRACK_SPECS[key].botTicks).toBe(BOT[key][0]);
      expect(fmtLap(total(r))).toBe(BOT[key][1]);
      const [a, b, c] = sectorTimes(r.split);
      expect(a > 0 && b > 0 && c > 0).toBe(true);
      expect(a + b + c).toBe(total(r));
    });
  }

  it("повтор дає ідентичну траєкторію (два прогони — біт у біт)", () => {
    const tr = buildTrack("port");
    const inp = unrle(TRACK_SPECS.port.botInputs);
    const a = simulate(tr, inp);
    const b = simulate(buildTrack("port"), inp);
    expect([a.x, a.y, a.v, a.hx]).toEqual([b.x, b.y, b.v, b.hx]);
  });

  it("довжина осі = заявленій довжині траси (±0,5 %)", () => {
    for (const key of TRACK_KEYS) {
      const tr = buildTrack(key);
      let L = 0;
      for (let i = 0; i < tr.N; i++) {
        const j = (i + 1) % tr.N;
        L += Math.hypot(tr.P[2 * j]! - tr.P[2 * i]!, tr.P[2 * j + 1]! - tr.P[2 * i + 1]!);
      }
      expect(Math.abs(L - tr.len) / tr.len).toBeLessThan(0.005);
    }
  });
});

describe("правила кола", () => {
  it("без вводу коло не зараховується", () => {
    const r = simulate(buildTrack("lyman"), new Array(20000).fill(0));
    expect(r.done).toBe(false);
  });

  it("лише газ — вихід за межі дає штраф +1 с (total = t + pen × 120)", () => {
    const tr = buildTrack("forest");
    const s = newCar(tr);
    for (let k = 0; k < 4000 && !s.done; k++) step(tr, s, IN_UP);
    expect(s.pen).toBeGreaterThan(0);
    expect(total(s)).toBe(s.t + s.pen * TPS);
  });

  it("verifyLap: справжнє коло бота приймається, підроблений час — ні, зіпсований рядок — ні", () => {
    const tr = buildTrack("lyman");
    const inputs = TRACK_SPECS.lyman.botInputs;
    expect(verifyLap(tr, inputs, 3592, true)?.total).toBe(3592);
    expect(verifyLap(tr, inputs, 3000)).toBeNull();
    expect(verifyLap(tr, "1.99999999", 3592)).toBeNull();
    expect(verifyLap(tr, "<script>", 3592)).toBeNull();
  });
});

describe("rle і формат", () => {
  it("rle ↔ unrle", () => {
    const a = [0, 0, 1, 1, 1, 9, 9, 2, 0xa, 0xa];
    expect(rle(a)).toBe("0.2,1.3,9.2,2.1,a.2");
    expect(unrle(rle(a))).toEqual(a);
    const bot = unrle(TRACK_SPECS.port.botInputs);
    expect(rle(bot)).toBe(TRACK_SPECS.port.botInputs);
  });
  it("unrle обмежує довжину (10 хв)", () => {
    expect(() => unrle("1.72001")).toThrow();
  });
  it("fmtLap / fmtSec", () => {
    expect(fmtLap(0)).toBe("0:00.000");
    expect(fmtLap(7200 + 61)).toBe("1:00.508");
    expect(fmtSec(1354)).toBe("11.283");
  });
  it("isTrackKey", () => {
    expect(isTrackKey("port")).toBe(true);
    expect(isTrackKey("monza")).toBe(false);
    expect(isTrackKey("__proto__")).toBe(false);
  });
});

describe("схема траси для картки (звірено з SVG макета)", async () => {
  const { trackThumb } = await import("../thumb");
  it("старт Лимана й Бору — як у макеті", () => {
    expect(trackThumb("lyman").start).toEqual([45.8, 7]);
    expect(trackThumb("forest").start).toEqual([70, 20.1]);
    expect(trackThumb("port").start).toEqual([71, 7]);
    expect(trackThumb("plateau").start).toEqual([83.7, 7]);
  });
});

describe("сховище рекордів", async () => {
  const { parseStore, addLap, MAX_LAPS } = await import("../store");
  it("сторонній або зіпсований JSON — порожньо", () => {
    expect(parseStore(null)).toEqual({ best: null, laps: [] });
    expect(parseStore("{oops")).toEqual({ best: null, laps: [] });
    expect(parseStore('{"best":{"inputs":1,"total":"x"},"laps":[{"t":-1}]}')).toEqual({ best: null, laps: [] });
  });
  it("коректний запис і ліміт кіл", () => {
    const st = parseStore('{"best":{"inputs":"1.5","total":3600},"laps":[{"t":3600,"pen":0,"at":1}]}');
    expect(st.best).toEqual({ inputs: "1.5", total: 3600 });
    let s = st;
    for (let i = 0; i < 15; i++) s = addLap(s, { t: 4000 + i, pen: 0, at: i }, null);
    expect(s.laps).toHaveLength(MAX_LAPS);
    expect(s.laps[0]!.t).toBe(4014);
    expect(s.best).toEqual(st.best);
  });
});
