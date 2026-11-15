import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRACK_SPECS, unrle } from "@/lib/game/physics";
import { storeKey } from "@/lib/game/store";
import { HotLapEngine, type Elements } from "../engine";

// Рушій у jsdom: canvas не малює (getContext → null), Path2D — заглушка; кадри rAF ганяємо вручну, по одному
// тіку фізики на кадр, і «натискаємо» ввід бота — коло має зарахуватися рівно за його час.
class FakePath2D {
  moveTo() {}
  lineTo() {}
  closePath() {}
  rect() {}
  arc() {}
}

let rafCb: FrameRequestCallback | null = null;
let now = 0;
const TICK_MS = 1000 / 120 + 1e-6;

function elements(): Elements {
  const div = () => document.createElement("div");
  const game = div();
  game.tabIndex = 0;
  const lights = div();
  for (let i = 0; i < 5; i++) lights.append(Object.assign(document.createElement("i"), { className: "gm-lamp" }));
  document.body.append(game);
  return {
    game,
    view: document.createElement("canvas"),
    mini: document.createElement("canvas"),
    time: div(),
    kmh: div(),
    delta: div(),
    react: div(),
    toast: div(),
    lights,
    sectors: [div(), div(), div()],
  };
}

/** Один кадр = один тік фізики. */
function frame() {
  const cb = rafCb;
  rafCb = null;
  now += TICK_MS;
  cb?.(now);
}

beforeEach(() => {
  vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    rafCb = null;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(Math, "random").mockReturnValue(0);
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function driveBotLap(engine: HotLapEngine, key: keyof typeof TRACK_SPECS) {
  const inputs = unrle(TRACK_SPECS[key].botInputs);
  engine.start();
  // Вогні: 5 × 84 + 60 тіків (Math.random = 0).
  let guard = 0;
  while (engine.getSnapshot().phase === "lights" && guard++ < 1000) frame();
  expect(engine.getSnapshot().phase).toBe("run");
  let prev = 0;
  for (const b of inputs) {
    engine.press(prev & ~b, false);
    engine.press(b, true);
    prev = b;
    frame();
    if (engine.getSnapshot().phase !== "run") break;
  }
  engine.press(15, false);
}

describe("HotLapEngine", () => {
  it("коло бота на Лимані через рушій: 0:29.933, перше коло = рекорд, збережено ввід, повтор зараховано", () => {
    const engine = new HotLapEngine();
    engine.setLabels({ react: "R", s: "s", off: "+1" });
    const detach = engine.attach(elements());
    expect(engine.getSnapshot()).toMatchObject({ mounted: true, key: "lyman", phase: "ready", bestTotal: null });

    driveBotLap(engine, "lyman");
    const snap = engine.getSnapshot();
    expect(snap.phase).toBe("done");
    expect(snap.result).toEqual({ t: 3592, pen: 0, valid: true, isBest: true, prevBest: null });
    expect(snap.bestTotal).toBe(3592);
    expect(snap.cardBests.lyman).toBe(3592);
    expect(snap.laps).toHaveLength(1);
    const stored = JSON.parse(localStorage.getItem(storeKey("lyman"))!);
    expect(stored.best.total).toBe(3592);

    // Новий рушій (перезавантаження сторінки): рекорд з localStorage перевірено повтором і показано.
    detach();
    const again = new HotLapEngine();
    again.attach(elements());
    expect(again.getSnapshot().bestTotal).toBe(3592);
  });

  it("підроблений рекорд у сховищі відкидається і стирається", () => {
    localStorage.setItem(storeKey("port"), JSON.stringify({ best: { inputs: TRACK_SPECS.port.botInputs, total: 100 }, laps: [] }));
    window.location.hash = "#port";
    const engine = new HotLapEngine();
    engine.attach(elements());
    expect(engine.getSnapshot()).toMatchObject({ key: "port", bestTotal: null });
    expect(engine.getSnapshot().cardBests.port).toBeNull();
    expect(JSON.parse(localStorage.getItem(storeKey("port"))!).best).toBeNull();
  });

  it("траса з попередньої мови (sessionStorage), привид «Мій рекорд» недоступний без рекорду", () => {
    sessionStorage.setItem("slipstream-hotlap-track", "forest");
    const engine = new HotLapEngine();
    engine.attach(elements());
    expect(engine.getSnapshot().key).toBe("forest");
    engine.setGhost(false);
    expect(engine.getSnapshot().preferBot).toBe(false);
    engine.setGhost(true);
    expect(engine.getSnapshot().preferBot).toBe(true);
  });
});
