import type { Dictionary } from "@/i18n/get-dictionary";
import type { Picks } from "@/lib/play/predictions";

export type PredictionsText = Dictionary["predictions"];

/** Збережений прогноз гравця (відповідь /api/predictions → mine). */
export type SavedPrediction = { picks: Picks; dnfTeam: number | null; allFinish: boolean; updatedAt: string | null };

/** Прогноз гравця на показ після дедлайну (відповідь /api/predictions → revealed). */
export type RevealedRow = { kind: "Q" | "R"; player: string; picks: Picks; dnfTeam: number | null; allFinish: boolean; points: number | null };

/** Відповідь GET /api/predictions. */
export type RoundApi = {
  now: number;
  deadline: string | null;
  closed: boolean;
  /** Є дійсна сесія. `signedIn: true` при `user: null` — ввійшов, але профіль прочитати не вдалося (інтерфейс не пропонує входу). */
  signedIn: boolean;
  /** nick: null — профілю ще немає; publicName — як гравця бачать у таблиці (нік або «Гравець XXXX»). */
  user: { nick: string | null; publicName: string | null } | null;
  mine: { Q: SavedPrediction | null; R: SavedPrediction | null } | null;
  revealed: RevealedRow[] | null;
  unavailable: boolean;
};
