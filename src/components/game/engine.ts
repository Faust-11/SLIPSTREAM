/**
 * «Гаряче коло» — рушій гри поза React: фізика 120 Гц, кадри, HUD (пряме оновлення DOM), клавіатура.
 * React читає лише рідкісний стан через useSyncExternalStore (snapshot): трасу, фазу, результат, кола.
 * Кадри крутяться лише поки щось рухається і сцену видно (план фази 6, п. 3).
 */
import {
  TPS,
  TRACK_KEYS,
  TRACK_SPECS,
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
  verifyLap,
  type Car,
  type Lap,
  type Track,
  type TrackKey,
} from "@/lib/game/physics";
import { addLap, loadStore, saveStore, type StoredLap } from "@/lib/game/store";
import { buildScenery, drawMini, drawScene, runPattern, type Scenery, type View } from "./scene";

export type Phase = "ready" | "lights" | "run" | "done";
export type Result = { t: number; pen: number; valid: boolean; isBest: boolean; prevBest: number | null };
export type Snapshot = {
  mounted: boolean;
  key: TrackKey;
  phase: Phase;
  result: Result | null;
  laps: StoredLap[];
  bestTotal: number | null;
  botTotal: number | null;
  preferBot: boolean;
  cardBests: Partial<Record<TrackKey, number | null>>;
};
export type HudLabels = { react: string; s: string; off: string };
export type Elements = {
  game: HTMLElement;
  view: HTMLCanvasElement;
  mini: HTMLCanvasElement;
  time: HTMLElement;
  kmh: HTMLElement;
  delta: HTMLElement;
  react: HTMLElement;
  toast: HTMLElement;
  lights: HTMLElement;
  sectors: HTMLElement[];
};

const MAP: Record<string, number> = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 4, KeyA: 4, ArrowRight: 8, KeyD: 8 };
export const LAST_TRACK = "slipstream-hotlap-track";
/** Коло довше за 10 хв не зберегти (ліміт unrle) — заїзд скидається. */
const MAX_TICKS = TPS * 600;

export const INITIAL: Snapshot = {
  mounted: false,
  key: "lyman",
  phase: "ready",
  result: null,
  laps: [],
  bestTotal: null,
  botTotal: TRACK_SPECS.lyman.botTicks,
  preferBot: false,
  cardBests: {},
};

/** Чип HUD «підпис + значення» без innerHTML. */
function setChip(el: HTMLElement, label: string, value: string) {
  const small = document.createElement("small");
  small.textContent = label;
  el.replaceChildren(small, value);
}

function cardBest(k: TrackKey): number | null {
  const st = loadStore(k);
  return st.best && verifyLap(buildTrack(k), st.best.inputs, st.best.total) ? st.best.total : null;
}

export class HotLapEngine {
  private snap: Snapshot = INITIAL;
  private listeners = new Set<() => void>();
  private el: Elements | null = null;
  private labels: HudLabels = { react: "", s: "", off: "" };

  private tr: Track = buildTrack("lyman");
  private sc: Scenery | null = null;
  private run: CanvasPattern | string | null = null;
  private car: Car = newCar(this.tr);
  private ghost: Car | null = null;
  private ghostSrc: Lap | null = null;
  private best: Lap | null = null;
  private bot: Lap | null = null;
  private rec: number[] = [];
  private lt = 0;
  private outTick = 0;
  private reaction: number | null = null;
  private toastT = 0;
  private phase: Phase = "ready";
  private keys = { kb: 0, touch: 0 };
  private view: View = { camRotate: true, camAng: 0 };
  private marked = [false, false, false];
  private visible = true;
  private raf = 0;
  private last = 0;
  private acc = 0;

  // ---------- зовнішнє сховище для React ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  getServerSnapshot = () => INITIAL;
  private emit(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  setLabels(l: HudLabels) {
    this.labels = l;
  }

  /** Підключення до DOM: трасу беремо з адреси (#port), інакше з попередньої мови (sessionStorage), інакше Лиман. */
  attach(el: Elements): () => void {
    this.el = el;
    this.view.camRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fromHash = window.location.hash.slice(1);
    let k: TrackKey = "lyman";
    if (isTrackKey(fromHash)) k = fromHash;
    else {
      try {
        const s = sessionStorage.getItem(LAST_TRACK);
        if (s && isTrackKey(s)) k = s;
      } catch {
        // без сховища — Лиман
      }
    }
    const cardBests: Snapshot["cardBests"] = {};
    for (const t of TRACK_KEYS) cardBests[t] = cardBest(t);
    this.emit({ cardBests, mounted: true });
    this.selectTrack(k);

    const onHash = () => {
      const h = window.location.hash.slice(1);
      if (isTrackKey(h) && h !== this.tr.key) this.selectTrack(h);
    };
    let inView = true;
    const vis = () => {
      this.visible = inView && document.visibilityState === "visible";
      if (this.visible) this.kick();
    };
    const io = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      vis();
    });
    io.observe(el.game);
    const ro = new ResizeObserver(() => this.kick());
    ro.observe(el.game);
    const blur = () => (this.keys = { kb: 0, touch: 0 });
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.el = null;
    };
  }

  // ---------- дії ----------
  selectTrack(k: TrackKey) {
    this.tr = buildTrack(k);
    this.sc = buildScenery(this.tr);
    this.run = null;
    const store = loadStore(k);
    this.best = store.best ? verifyLap(this.tr, store.best.inputs, store.best.total) : null;
    if (store.best && !this.best) {
      store.best = null;
      saveStore(k, store);
    }
    const spec = TRACK_SPECS[k];
    this.bot = verifyLap(this.tr, spec.botInputs, spec.botTicks, true);
    this.car = newCar(this.tr);
    this.ghost = null;
    this.ghostSrc = null;
    this.phase = "ready";
    this.view.camAng = this.view.camRotate ? Math.atan2(this.car.hy, this.car.hx) : -Math.PI / 2;
    if (this.el) this.el.lights.hidden = true;
    this.resetHud();
    try {
      sessionStorage.setItem(LAST_TRACK, k);
    } catch {
      // без сховища мова просто повернеться на Лиман
    }
    const bestTotal = this.best ? this.best.total : null;
    this.emit({ key: k, phase: "ready", result: null, laps: store.laps, bestTotal, botTotal: this.bot ? this.bot.total : null, cardBests: { ...this.snap.cardBests, [k]: bestTotal } });
    this.kick();
  }

  start = () => {
    if (!this.el) return;
    this.car = newCar(this.tr);
    this.ghostSrc = this.snap.preferBot ? this.bot : (this.best ?? this.bot);
    this.ghost = this.ghostSrc ? newCar(this.tr) : null;
    this.rec = [];
    this.lt = 0;
    this.reaction = null;
    this.marked = [false, false, false];
    // Згасання вогнів: 5 ламп по 0,7 с + 0,5–1,5 с випадкової паузи (на час кола не впливає).
    this.outTick = 5 * 84 + 60 + Math.floor(Math.random() * 120);
    this.phase = "lights";
    this.el.lights.hidden = false;
    this.el.lights.querySelectorAll(".gm-lamp").forEach((l) => l.classList.remove("is-on"));
    this.resetHud();
    this.emit({ phase: "lights", result: null });
    this.el.game.focus({ preventScroll: true });
    this.kick();
  };

  setGhost(bot: boolean) {
    if (!bot && !this.best) return;
    this.emit({ preferBot: bot });
  }

  press(bit: number, on: boolean) {
    if (on) this.keys.touch |= bit;
    else this.keys.touch &= ~bit;
  }

  // ---------- клавіатура ----------
  private inGame() {
    const g = this.el?.game;
    return (!!g && g.contains(document.activeElement)) || this.phase === "run" || this.phase === "lights";
  }
  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const bit = MAP[ev.code];
    if (bit) {
      if (this.inGame()) {
        this.keys.kb |= bit;
        ev.preventDefault();
      }
    } else if (ev.code === "Space") {
      // На кнопках бічної колонки й «Поділитися» Пробіл натискає саму кнопку.
      const onSideBtn = (ev.target as Element | null)?.closest?.(".gm-side-btn");
      if (this.inGame() && (this.phase === "ready" || this.phase === "done") && !onSideBtn) {
        ev.preventDefault();
        this.start();
      }
    } else if (ev.code === "KeyR") {
      if (this.inGame()) this.start();
    } else if (ev.code === "KeyC") {
      if (this.inGame()) {
        this.view.camRotate = !this.view.camRotate;
        this.kick();
      }
    }
  };
  private onKeyUp = (ev: KeyboardEvent) => {
    const bit = MAP[ev.code];
    if (bit) this.keys.kb &= ~bit;
  };

  // ---------- HUD ----------
  private resetHud() {
    const el = this.el;
    if (!el) return;
    el.sectors.forEach((s, i) => {
      s.className = "gm-chip";
      setChip(s, `S${i + 1}`, "—");
    });
    el.delta.hidden = true;
    el.react.hidden = true;
    el.toast.hidden = true;
  }
  private markSector(k: 0 | 1 | 2) {
    this.marked[k] = true;
    const s = this.el?.sectors[k];
    if (!s) return;
    const mine = sectorTimes(this.car.split)[k];
    const cls = this.best ? (mine < sectorTimes(this.best.split)[k] ? "is-purple" : "is-yellow") : "is-green";
    s.className = `gm-chip ${cls}`;
    setChip(s, `S${k + 1}`, fmtSec(mine));
  }

  // ---------- фізика ----------
  private finish() {
    this.phase = "done";
    const car = this.car;
    const t = total(car);
    const check = simulate(this.tr, this.rec);
    const valid = check.done && total(check) === t;
    const isBest = valid && (!this.best || t < this.best.total);
    const prevBest = this.best ? this.best.total : null;
    const k = this.tr.key;
    let patch: Partial<Snapshot> = {};
    if (valid) {
      const st = addLap(loadStore(k), { t, pen: car.pen, at: Date.now() }, isBest ? { inputs: rle(this.rec), total: t } : null);
      if (isBest) this.best = { inputs: this.rec.slice(), total: t, split: [...car.split], at: check.at };
      saveStore(k, st);
      const bestTotal = this.best ? this.best.total : null;
      patch = { laps: st.laps, bestTotal, cardBests: { ...this.snap.cardBests, [k]: bestTotal } };
    }
    this.emit({ ...patch, phase: "done", result: { t, pen: car.pen, valid, isBest, prevBest } });
  }

  private tick() {
    const el = this.el;
    const car = this.car;
    if (this.phase === "lights") {
      this.lt++;
      const on = Math.min(5, Math.floor(this.lt / 84));
      el?.lights.querySelectorAll(".gm-lamp").forEach((l, i) => l.classList.toggle("is-on", i < on && this.lt < this.outTick));
      if (this.lt >= this.outTick) {
        this.phase = "run";
        this.emit({ phase: "run" });
        window.setTimeout(() => {
          if (this.phase !== "lights" && this.el) this.el.lights.hidden = true;
        }, 600);
      }
      return;
    }
    if (this.phase === "run") {
      const b = this.keys.kb | this.keys.touch;
      this.rec.push(b);
      step(this.tr, car, b);
      if (this.reaction === null && b & 1) {
        this.reaction = car.t;
        if (el) {
          el.react.hidden = false;
          setChip(el.react, this.labels.react, `${fmtSec(this.reaction)} ${this.labels.s}`);
        }
      }
      if (car.penEvent && el) {
        el.toast.textContent = this.labels.off;
        el.toast.hidden = false;
        this.toastT = TPS * 1.6;
      }
      if (car.split[0] && !this.marked[0]) this.markSector(0);
      if (car.split[1] && !this.marked[1]) this.markSector(1);
      if (this.ghost && this.ghostSrc) step(this.tr, this.ghost, this.ghost.t < this.ghostSrc.inputs.length ? this.ghostSrc.inputs[this.ghost.t]! : 2);
      if (car.done) {
        this.markSector(2);
        this.finish();
      } else if (this.rec.length >= MAX_TICKS) {
        this.phase = "ready";
        this.car = newCar(this.tr);
        this.ghost = null;
        this.resetHud();
        this.emit({ phase: "ready", result: null });
      }
    } else if (this.phase === "done") {
      step(this.tr, car, 2);
      if (this.ghost) step(this.tr, this.ghost, 2);
    }
    if (this.toastT > 0 && --this.toastT === 0 && el) el.toast.hidden = true;
  }

  // ---------- кадри ----------
  private kick() {
    if (this.raf || !this.visible || !this.el) return;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.el) return;
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.acc += dt;
    while (this.acc >= 1 / TPS) {
      this.tick();
      this.acc -= 1 / TPS;
    }
    const easing = this.render(dt);
    const g = this.ghost;
    const moving = this.phase === "lights" || this.phase === "run" || (this.phase === "done" && (this.car.v > 0.01 || (g !== null && !g.done && g.v > 0.01)));
    if ((moving || easing) && this.visible) this.raf = requestAnimationFrame(this.frame);
  };

  /** Малює кадр; повертає true, поки камера ще доводиться до напрямку боліда. */
  private render(dt: number): boolean {
    const el = this.el;
    const sc = this.sc;
    if (!el || !sc) return false;
    const cv = el.view;
    const ctx = cv.getContext("2d");
    if (!ctx) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr);
    const H = Math.round(cv.clientHeight * dpr);
    if (W === 0 || H === 0) return false;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    if (!this.run) this.run = runPattern(ctx, sc);
    const { car, view } = this;
    const target = view.camRotate ? Math.atan2(car.hy, car.hx) : -Math.PI / 2;
    let d = target - view.camAng;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    view.camAng += d * Math.min(1, dt * 5);
    const ghost = this.ghost && !(this.ghost.done && this.phase !== "run") ? this.ghost : null;
    drawScene(ctx, W, H, sc, this.run, car, ghost, view);
    const m = el.mini.getContext("2d");
    const S = Math.round(el.mini.clientWidth * dpr);
    if (m && S > 0) {
      if (el.mini.width !== S) el.mini.width = el.mini.height = S;
      drawMini(m, S, dpr, sc, car, this.ghost);
    }
    const shown = this.phase === "run" ? car.t + car.pen * TPS : this.phase === "done" ? total(car) : 0;
    el.time.textContent = fmtLap(shown);
    el.kmh.textContent = String(Math.round(car.v * 3.6));
    const src = this.ghostSrc;
    if (this.phase === "run" && src && car.crossed && src.at[car.idx]! >= 0 && car.t % 12 === 0) {
      const dl = car.t - src.at[car.idx]!;
      el.delta.hidden = false;
      el.delta.className = `gm-chip ${dl <= 0 ? "is-ahead" : "is-behind"}`;
      el.delta.textContent = `${dl <= 0 ? "−" : "+"}${fmtSec(Math.abs(dl))}`;
    }
    return Math.abs(d) > 0.002;
  }
}
