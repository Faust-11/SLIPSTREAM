/**
 * Рекорди «Гарячого кола» в браузері (рішення користувача 15.11: до входу у фазі 9 — лише localStorage).
 * Запис кола = ввід (RLE) + час у тіках: той самий формат піде на сервер у фазі 9, де коло перевірятиметься
 * повтором через physics.ts. Тут повтор теж перевіряє збережене: підроблений час відкидається.
 */
import type { TrackKey } from "./physics";

export type StoredLap = { t: number; pen: number; at: number };
/** sectors — найкращий час кожного сектора з усіх зарахованих кіл (для «фіолетового» в хронометражі). */
export type TrackStore = { best: { inputs: string; total: number } | null; laps: StoredLap[]; sectors: [number, number, number] | null };

export const MAX_LAPS = 10;
export const storeKey = (k: TrackKey) => `slipstream-hotlap-v2-${k}`;

const isInt = (v: unknown, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
/** Межі значень: коло ≤ 10 хв + штрафи, дата — у межах Date (інакше Intl.DateTimeFormat кидає RangeError). */
const MAX_T = 120 * 600 + 120 * 1000;
const MAX_PEN = 1000;
const MAX_DATE = 8.64e15;

/** Розбір рядка сховища з перевіркою форми (сторонній JSON не має зламати сторінку). */
export function parseStore(raw: string | null): TrackStore {
  const empty: TrackStore = { best: null, laps: [], sectors: null };
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const b = v?.best as Record<string, unknown> | null | undefined;
    const best = b && typeof b.inputs === "string" && b.inputs.length < 200_000 && isInt(b.total, MAX_T) ? { inputs: b.inputs, total: b.total } : null;
    const laps = Array.isArray(v?.laps)
      ? (v.laps as Record<string, unknown>[])
          .filter((l) => l && isInt(l.t, MAX_T) && isInt(l.pen, MAX_PEN) && isInt(l.at, MAX_DATE))
          .slice(0, MAX_LAPS)
          .map((l) => ({ t: l.t as number, pen: l.pen as number, at: l.at as number }))
      : [];
    const sc = v?.sectors;
    const sectors = Array.isArray(sc) && sc.length === 3 && sc.every((x) => isInt(x, MAX_T) && x > 0) ? (sc as [number, number, number]) : null;
    return { best, laps, sectors };
  } catch {
    return empty;
  }
}

export function loadStore(k: TrackKey): TrackStore {
  try {
    return parseStore(localStorage.getItem(storeKey(k)));
  } catch {
    return { best: null, laps: [], sectors: null };
  }
}

export function saveStore(k: TrackKey, st: TrackStore): void {
  try {
    localStorage.setItem(storeKey(k), JSON.stringify(st));
  } catch {
    // приватне вікно / заблоковане сховище — коло просто не запам'ятається
  }
}

/**
 * Додати зараховане коло: новіші зверху, не більше MAX_LAPS. Рекорд замінюється лише швидшим за збережений
 * (інша вкладка могла записати кращий — рев'ю PR #26); рекорди секторів — мінімум по кожному.
 */
export function addLap(st: TrackStore, lap: StoredLap, candidate: TrackStore["best"], split?: readonly number[]): TrackStore {
  const best = candidate && (!st.best || candidate.total < st.best.total) ? candidate : st.best;
  let sectors = st.sectors;
  if (split && split.length === 3) {
    const mine: [number, number, number] = [split[0]!, split[1]! - split[0]!, split[2]! - split[1]!];
    sectors = sectors ? [Math.min(sectors[0], mine[0]), Math.min(sectors[1], mine[1]), Math.min(sectors[2], mine[2])] : mine;
  }
  return { best, laps: [lap, ...st.laps].slice(0, MAX_LAPS), sectors };
}
