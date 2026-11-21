import { buildTrack, isTrackKey, simulate, total, TPS, TRACK_SPECS, unrle, type TrackKey } from "./physics";

/**
 * Серверна перевірка кола для таблиці лідерів. Клієнт присилає лише трасу, ввід (RLE) і ознаку фальстарту — час він не
 * повідомляє: його рахує тут той самий детермінований step, що крутить гру (physics.ts), тож підробити час, не підробивши
 * сам заїзд, неможливо. Що це НЕ захищає: скрипт, який підбирає ідеальний ввід (бот), пройде перевірку так само, як людина —
 * фізика однакова для всіх; це свідома межа (docs/decisions.md, «Таблиця лідерів гри»).
 */

/** Довжина рядка вводу (RLE): бот-еталон — 1,4–3,4 КБ; з запасом на людське коло з частими змінами. Збігається з CHECK у play.laps. */
export const MAX_INPUT_CHARS = 30_000;
/** Ввід довший за 10 хвилин (120 тіків/с) — не коло: unrle відхиляє. */
export const MAX_INPUT_TICKS = TPS * 600;

/**
 * Максимальна швидкість боліда в моделі: стале значення, де розгін (16 − 0,1 v) дорівнює опору (0,0012 v² + 0,8):
 * 0,0012 v² + 0,1 v − 15,2 = 0 → v ≈ 78,3 м/с. Коло довжиною L не пройти швидше за L / 78,3 с — це жорстка нижня межа
 * (замір 21.11: бот-еталон їде в середньому 40–50 м/с, тобто межа становить 52–64 % його часу).
 */
export const MAX_SPEED = 78.3;
export const minTicks = (key: TrackKey): number => Math.ceil((TRACK_SPECS[key].len / MAX_SPEED) * TPS);

export type LapProblem = "bad_track" | "bad_inputs" | "unfinished" | "too_fast";
export type LapCheck = { ok: true; ticks: number; pen: number; jump: boolean } | { ok: false; problem: LapProblem };

/** Форма тіла: траса зі списку, ввід — рядок RLE допустимої довжини, jump — булеве (інакше false). */
export function parseLapBody(body: Record<string, unknown> | null): { ok: true; track: TrackKey; inputs: string; jump: boolean } | { ok: false; problem: LapProblem } {
  const track = typeof body?.track === "string" ? body.track : "";
  if (!isTrackKey(track)) return { ok: false, problem: "bad_track" };
  const inputs = body?.inputs;
  if (typeof inputs !== "string" || inputs.length === 0 || inputs.length > MAX_INPUT_CHARS || !/^[0-9a-f.,]+$/.test(inputs)) return { ok: false, problem: "bad_inputs" };
  return { ok: true, track, inputs, jump: body?.jump === true };
}

/**
 * Повтор заїзду: ввід має довести болід до фінішу (три сектори), час = тіки + штрафи за вихід за межі + 1 с за фальстарт
 * (як engine.finish). Повторює ввід до фінішу — зайвий хвіст ігнорується так само, як у грі.
 */
export function checkLap(track: TrackKey, inputs: string, jump: boolean): LapCheck {
  let inp: number[];
  try {
    inp = unrle(inputs, MAX_INPUT_TICKS);
  } catch {
    return { ok: false, problem: "bad_inputs" };
  }
  const car = simulate(buildTrack(track), inp);
  if (!car.done) return { ok: false, problem: "unfinished" };
  const ticks = total(car) + (jump ? TPS : 0);
  if (ticks < minTicks(track)) return { ok: false, problem: "too_fast" };
  return { ok: true, ticks, pen: car.pen, jump };
}
