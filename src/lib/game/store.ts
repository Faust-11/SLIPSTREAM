/**
 * Рекорди «Гарячого кола» в браузері (рішення користувача 15.11: до входу у фазі 9 — лише localStorage).
 * Запис кола = ввід (RLE) + час у тіках: той самий формат піде на сервер у фазі 9, де коло перевірятиметься
 * повтором через physics.ts. Тут повтор теж перевіряє збережене: підроблений час відкидається.
 */
import type { TrackKey } from "./physics";

export type StoredLap = { t: number; pen: number; at: number };
export type TrackStore = { best: { inputs: string; total: number } | null; laps: StoredLap[] };

export const MAX_LAPS = 10;
export const storeKey = (k: TrackKey) => `slipstream-hotlap-v2-${k}`;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Розбір рядка сховища з перевіркою форми (сторонній JSON не має зламати сторінку). */
export function parseStore(raw: string | null): TrackStore {
  const empty: TrackStore = { best: null, laps: [] };
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const b = v?.best as Record<string, unknown> | null | undefined;
    const best = b && typeof b.inputs === "string" && b.inputs.length < 200_000 && isInt(b.total) ? { inputs: b.inputs, total: b.total } : null;
    const laps = Array.isArray(v?.laps)
      ? (v.laps as Record<string, unknown>[])
          .filter((l) => l && isInt(l.t) && isInt(l.pen) && isInt(l.at))
          .slice(0, MAX_LAPS)
          .map((l) => ({ t: l.t as number, pen: l.pen as number, at: l.at as number }))
      : [];
    return { best, laps };
  } catch {
    return empty;
  }
}

export function loadStore(k: TrackKey): TrackStore {
  try {
    return parseStore(localStorage.getItem(storeKey(k)));
  } catch {
    return { best: null, laps: [] };
  }
}

export function saveStore(k: TrackKey, st: TrackStore): void {
  try {
    localStorage.setItem(storeKey(k), JSON.stringify(st));
  } catch {
    // приватне вікно / заблоковане сховище — коло просто не запам'ятається
  }
}

/** Додати зараховане коло: новіші зверху, не більше MAX_LAPS. */
export function addLap(st: TrackStore, lap: StoredLap, best: TrackStore["best"]): TrackStore {
  return { best: best ?? st.best, laps: [lap, ...st.laps].slice(0, MAX_LAPS) };
}
