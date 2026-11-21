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
/** pen — штрафи за межі траси; jump — фальстарт (+1 с, газ до згасання вогнів); inputs — ввід заїзду (RLE) для таблиці лідерів: сервер повторює коло. */
export type Result = { t: number; pen: number; jump: boolean; isBest: boolean; prevBest: number | null; inputs: string };
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
export type HudLabels = { react: string; s: string; off: string; jump: string };
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

/**
 * Кеш на трасу: геометрія, декор і коло бота рахуються один раз за відкриття сторінки (рев'ю PR #26: монтування
 * з чотирма рекордами займало 160–220 мс в одній задачі). Коло бота — лениво (у простої або на старті).
 */
type Cached = { tr: Track; sc?: Scenery; bot?: Lap | null };
const CACHE = new Map<TrackKey, Cached>();
function cached(k: TrackKey): Cached {
  let c = CACHE.get(k);
  if (!c) CACHE.set(k, (c = { tr: buildTrack(k) }));
  return c;
}
function botLap(k: TrackKey): Lap | null {
  const c = cached(k);
  if (c.bot === undefined) c.bot = verifyLap(c.tr, TRACK_SPECS[k].botInputs, TRACK_SPECS[k].botTicks, true);
  return c.bot;
}
function scenery(k: TrackKey): Scenery {
  const c = cached(k);
  return (c.sc ??= buildScenery(c.tr));
}
/** Перевірений рекорд траси (повтор вводу) або null; підроблений стирається зі сховища. */
function verifiedBest(k: TrackKey) {
  const store = loadStore(k);
  const jumpT = store.best?.jump ? TPS : 0;
  const lap = store.best ? verifyLap(cached(k).tr, store.best.inputs, store.best.total - jumpT) : null;
  const best = lap ? { ...lap, total: lap.total + jumpT } : null;
  if (store.best && !best) {
    store.best = null;
    saveStore(k, store);
  }
  return { store, best };
}
/** Робота в простої (по одній трасі за задачу), щоб не займати головний потік довгою задачею. */
const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 50);
  return () => window.clearTimeout(id);
};

/** Поле вводу — клавіші гри не перехоплюємо (порт фільтра макета). */
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || !!t.closest("input, textarea, select"));

export class HotLapEngine {
  private snap: Snapshot = INITIAL;
  private listeners = new Set<() => void>();
  private el: Elements | null = null;
  private labels: HudLabels = { react: "", s: "", off: "", jump: "" };
  /** Фальстарт у поточному заїзді: газ натиснуто, поки горіли вогні (+1 с до часу кола). */
  private jump = false;

  private tr: Track = cached("lyman").tr;
  private sc: Scenery | null = null;
  private sectors: [number, number, number] | null = null;
  private lastDelta = 0;
  private alive = false;
  /** Скасування відкладеної задачі черги простою (detach). */
  private cancelIdle: () => void = () => {};
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
    this.alive = true;
    this.emit({ mounted: true });
    this.selectTrack(k);
    // Рекорди інших карток і коло бота поточної траси — у простої, по одній трасі за раз.
    const queue: (() => void)[] = [() => botLap(this.tr.key)];
    for (const t of TRACK_KEYS)
      queue.push(() => {
        if (t !== this.tr.key && this.snap.cardBests[t] === undefined) this.emit({ cardBests: { ...this.snap.cardBests, [t]: verifiedBest(t).best?.total ?? null } });
      });
    const next = () => {
      const job = queue.shift();
      if (!job || !this.alive) return;
      job();
      this.cancelIdle = idle(next);
    };
    this.cancelIdle = idle(next);

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
      this.cancelIdle();
      this.raf = 0;
      this.el = null;
      this.alive = false;
    };
  }

  // ---------- дії ----------
  selectTrack(k: TrackKey) {
    this.tr = cached(k).tr;
    this.sc = scenery(k);
    this.run = null;
    const { store, best } = verifiedBest(k);
    this.best = best;
    this.sectors = store.sectors;
    this.bot = CACHE.get(k)?.bot ?? null;
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
    this.emit({ key: k, phase: "ready", result: null, laps: store.laps, bestTotal, botTotal: TRACK_SPECS[k].botTicks, cardBests: { ...this.snap.cardBests, [k]: bestTotal } });
    this.kick();
  }

  start = () => {
    if (!this.el) return;
    this.car = newCar(this.tr);
    this.bot ??= botLap(this.tr.key);
    this.ghostSrc = this.snap.preferBot ? this.bot : (this.best ?? this.bot);
    this.ghost = this.ghostSrc ? newCar(this.tr) : null;
    this.rec = [];
    this.lt = 0;
    this.reaction = null;
    this.jump = false;
    this.lastDelta = 0;
    this.marked = [false, false, false];
    // Згасання вогнів: 5 ламп по 0,7 с + 0,5–1,5 с випадкової паузи (на час кола не впливає; газ раніше — фальстарт).
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
  /** Фокус у грі. */
  private focused() {
    const g = this.el?.game;
    return !!g && g.contains(document.activeElement);
  }
  /**
   * Керування (стрілки/WASD, Пробіл) — коли фокус у грі або йде заїзд; R і C — лише з фокусом у грі.
   * У полях вводу клавіші не чіпаємо (рев'ю PR #26).
   */
  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || editable(ev.target)) return;
    const driving = this.phase === "run" || this.phase === "lights";
    const bit = MAP[ev.code];
    if (bit) {
      if (this.focused() || driving) {
        this.keys.kb |= bit;
        ev.preventDefault();
      }
    } else if (ev.code === "Space") {
      // На кнопках бічної колонки й «Поділитися» Пробіл натискає саму кнопку.
      if ((ev.target as Element | null)?.closest?.(".gm-side-btn")) return;
      if (this.focused() || driving) ev.preventDefault(); // у заїзді Пробіл не прокручує сторінку
      if (this.focused() && !driving) this.start();
    } else if (ev.code === "KeyR") {
      if (this.focused()) this.start();
    } else if (ev.code === "KeyC") {
      if (this.focused()) {
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
    el.react.className = "gm-chip";
    el.toast.hidden = true;
  }
  private markSector(k: 0 | 1 | 2) {
    this.marked[k] = true;
    const s = this.el?.sectors[k];
    if (!s) return;
    const mine = sectorTimes(this.car.split)[k];
    // Фіолетовий — не гірше за рекорд сектора (найкращий час сектора з усіх кіл), жовтий — повільніше,
    // зелений — сектор ще без рекорду (як у легенді).
    const rec = this.sectors?.[k];
    const cls = rec === undefined ? "is-green" : mine <= rec ? "is-purple" : "is-yellow";
    s.className = `gm-chip ${cls}`;
    setChip(s, `S${k + 1}`, fmtSec(mine));
  }

  // ---------- фізика ----------
  /**
   * Фініш. Повтор вводу тут не потрібен (живий болід — той самий детермінований step на тому самому вводі; макет
   * повторював коло ще раз — 12–35 мс на кадрі фінішу, рев'ю PR #26). Повтор лишається на завантаженні рекорду.
   */
  private finish() {
    this.phase = "done";
    const car = this.car;
    const jumpT = this.jump ? TPS : 0;
    const t = total(car) + jumpT;
    const k = this.tr.key;
    const stored = loadStore(k);
    // Попередній рекорд — кращий з пам'яті й сховища (інша вкладка могла записати швидший).
    const prev = [this.best?.total, stored.best?.total].filter((x): x is number => x !== undefined);
    const prevBest = prev.length ? Math.min(...prev) : null;
    const isBest = prevBest === null || t < prevBest;
    const inputs = rle(this.rec);
    const st = addLap(
      stored,
      { t, pen: car.pen + (this.jump ? 1 : 0), at: Date.now() },
      isBest ? { inputs, total: t, ...(this.jump ? { jump: true as const } : {}) } : null,
      car.split,
    );
    if (isBest) this.best = { inputs: this.rec.slice(), total: t, split: [...car.split], at: car.at };
    this.sectors = st.sectors;
    saveStore(k, st);
    if (this.el) this.el.toast.hidden = true;
    this.toastT = 0;
    const bestTotal = this.best ? this.best.total : null;
    this.emit({ laps: st.laps, bestTotal, cardBests: { ...this.snap.cardBests, [k]: bestTotal }, phase: "done", result: { t, pen: car.pen, jump: this.jump, isBest, prevBest, inputs } });
  }

  private tick() {
    const el = this.el;
    const car = this.car;
    if (this.phase === "lights") {
      this.lt++;
      // Фальстарт (рішення користувача 15.11): газ, поки горять вогні, — болід рушає одразу, вогні гаснуть, тост
      // «Фальстарт · +1 с». Час кола йде від цієї миті, тож ранній газ виграшу не дає — лише +1 с.
      if ((this.keys.kb | this.keys.touch) & 1 && this.lt < this.outTick) {
        this.jump = true;
        this.outTick = this.lt;
      }
      const on = Math.min(5, Math.floor(this.lt / 84));
      el?.lights.querySelectorAll(".gm-lamp").forEach((l, i) => l.classList.toggle("is-on", i < on && this.lt < this.outTick));
      if (this.lt >= this.outTick) {
        this.phase = "run";
        if (this.jump && el) {
          el.react.hidden = false;
          el.react.className = "gm-chip is-behind";
          el.react.textContent = this.labels.jump;
          el.toast.textContent = this.labels.jump;
          el.toast.hidden = false;
          this.toastT = TPS * 2;
        }
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
      if (this.reaction === null && !this.jump && b & 1) {
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

  /** HUD (час, км/год, дельта) і кадр сцени; повертає true, поки камера ще доводиться до напрямку боліда. */
  private render(dt: number): boolean {
    const el = this.el;
    const sc = this.sc;
    if (!el || !sc) return false;
    const { car, view } = this;
    const jumpT = this.jump ? TPS : 0;
    const shown = this.phase === "run" ? car.t + car.pen * TPS + jumpT : this.phase === "done" ? total(car) + jumpT : 0;
    el.time.textContent = fmtLap(shown);
    el.kmh.textContent = String(Math.round(car.v * 3.6));
    const src = this.ghostSrc;
    // Дельта — раз на 12 тіків (0,1 с) незалежно від частоти кадрів (у макеті car.t % 12 міг «застрягти»).
    if (this.phase === "run" && src && car.crossed && src.at[car.idx]! >= 0 && car.t - this.lastDelta >= 12) {
      this.lastDelta = car.t;
      const dl = car.t - src.at[car.idx]!;
      el.delta.hidden = false;
      el.delta.className = `gm-chip ${dl <= 0 ? "is-ahead" : "is-behind"}`;
      el.delta.textContent = `${dl <= 0 ? "−" : "+"}${fmtSec(Math.abs(dl))}`;
    }

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
      drawMini(m, S, dpr, sc, car, ghost);
    }
    return Math.abs(d) > 0.002;
  }
}
