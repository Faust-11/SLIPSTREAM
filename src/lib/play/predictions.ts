/**
 * Прогноз гравця — типи й перевірки, спільні для сервера (обробник /api/predictions) і клієнта (форма). Без server-only і
 * без Intl. База лишається остаточним суддею (play.save_prediction, play.picks_valid, тригер дедлайну): тут — швидка
 * відповідь без запиту й однакові правила на обох боках. Правила дзеркалять play.picks_valid (0015): 10 слотів, P1–P3
 * обов'язкові, P4–P10 можуть бути порожніми, без повторів пілота; «яка команда не фінішує» — лише в гонці й не разом із
 * «усі фінішують».
 */
export const PREDICTION_KINDS = ["Q", "R"] as const;
export type PredictionKind = (typeof PREDICTION_KINDS)[number];

export const SLOTS = 10;
/** Скільки перших слотів обов'язкові (подіум). */
export const REQUIRED_SLOTS = 3;

export type Picks = (number | null)[];

export type PredictionInput = {
  year: number;
  round: number;
  kind: PredictionKind;
  picks: Picks;
  /** f1.teams.id команди, яка (за прогнозом) не фінішує; лише для гонки. */
  dnfTeam: number | null;
  /** «Усі фінішують» (+10, якщо жоден болід не лишився некласифікованим); лише для гонки. */
  allFinish: boolean;
};

export type PredictionProblem = "bad_request" | "bad_kind" | "bad_picks" | "bad_extras";

/** Ідентифікатор рядка бази: додатне ціле, що безпечно ходить через JSON (bigint у play.* — до 2^53). */
export function isRowId(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}

export function isKind(v: unknown): v is PredictionKind {
  return v === "Q" || v === "R";
}

/** Рік і етап з рядків запиту (?year=2026&round=22): лише цілі в розумних межах. */
export function parseRoundKey(yearRaw: unknown, roundRaw: unknown): { year: number; round: number } | null {
  const year = typeof yearRaw === "string" && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : typeof yearRaw === "number" ? yearRaw : NaN;
  const round = typeof roundRaw === "string" && /^\d{1,2}$/.test(roundRaw) ? Number(roundRaw) : typeof roundRaw === "number" ? roundRaw : NaN;
  if (!Number.isInteger(year) || year < 1950 || year > 2200) return null;
  if (!Number.isInteger(round) || round < 1 || round > 40) return null;
  return { year, round };
}

/** Слоти: 10 значень, P1–P3 заповнені, без повторів. */
export function picksProblem(picks: readonly (number | null)[]): "count" | "required" | "duplicate" | null {
  if (picks.length !== SLOTS) return "count";
  for (let i = 0; i < REQUIRED_SLOTS; i++) if (picks[i] === null) return "required";
  const chosen = picks.filter((p): p is number => p !== null);
  return new Set(chosen).size === chosen.length ? null : "duplicate";
}

/** Тіло POST /api/predictions → перевірений прогноз або причина відмови. */
export function parsePrediction(body: Record<string, unknown> | null): { ok: true; value: PredictionInput } | { ok: false; problem: PredictionProblem } {
  if (!body) return { ok: false, problem: "bad_request" };
  const key = parseRoundKey(body.year, body.round);
  if (!key) return { ok: false, problem: "bad_request" };
  if (!isKind(body.kind)) return { ok: false, problem: "bad_kind" };
  const raw = body.picks;
  if (!Array.isArray(raw) || raw.length !== SLOTS || !raw.every((p) => p === null || isRowId(p))) return { ok: false, problem: "bad_picks" };
  const picks = raw as Picks;
  if (picksProblem(picks)) return { ok: false, problem: "bad_picks" };
  const dnfTeam = body.dnfTeam ?? null;
  const allFinish = body.allFinish ?? false;
  if ((dnfTeam !== null && !isRowId(dnfTeam)) || typeof allFinish !== "boolean") return { ok: false, problem: "bad_extras" };
  // Кваліфікація без «команди без фінішу»; «усі фінішують» і конкретна команда разом — суперечність (як у predictions_*_chk).
  if (body.kind === "Q" && (dnfTeam !== null || allFinish)) return { ok: false, problem: "bad_extras" };
  if (allFinish && dnfTeam !== null) return { ok: false, problem: "bad_extras" };
  return { ok: true, value: { ...key, kind: body.kind, picks, dnfTeam, allFinish } };
}

/** Рядок із бази (play.predictions / revealed_predictions) → слоти як масив чисел або null. */
export function normalizePicks(raw: unknown): Picks | null {
  if (!Array.isArray(raw) || raw.length !== SLOTS) return null;
  const out: Picks = [];
  for (const v of raw) {
    if (v === null) out.push(null);
    else if (isRowId(v)) out.push(v);
    else return null;
  }
  return out;
}

/** Підсумок стану дедлайну за часом сервера: null — дедлайн невідомий (база вважає етап закритим). */
export function isClosed(deadlineMs: number | null, nowMs: number): boolean {
  return deadlineMs === null || nowMs >= deadlineMs;
}
