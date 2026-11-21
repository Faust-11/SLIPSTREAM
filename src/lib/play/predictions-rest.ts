import "server-only";
import type { PlayConfig } from "./config";
import { isRowId, normalizePicks, REVEALED_LIMIT, type Picks, type PredictionInput, type PredictionKind } from "./predictions";

/**
 * PostgREST схеми play для прогнозів. Запис — лише через play.save_prediction від імені гравця (його access-токен у
 * Authorization: роль authenticated, auth.uid() і RLS — на боці бази; дедлайн перевіряє тригер predictions_guard).
 * Читання своїх прогнозів — RLS predictions_own_select; чужих — лише публічне подання play.revealed_predictions, яке саме
 * віддає рядки після дедлайну (на клієнті й тут це не перевіряється — база не дасть зайвого). Дедлайн (play.deadline) —
 * публічна функція; без токена йде з ключем publishable в apikey, як читання схеми f1 (src/lib/data/db.ts).
 */
type Call = { method: "GET" | "POST"; token: string | null; body?: unknown };

async function call(cfg: PlayConfig, path: string, init: Call): Promise<Response | null> {
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: init.method,
      headers: {
        apikey: cfg.key,
        accept: "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.method === "GET" ? { "accept-profile": "play" } : { "content-profile": "play", "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

async function rows(res: Response | null): Promise<Record<string, unknown>[] | null> {
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  return Array.isArray(body) ? (body.filter((r) => r && typeof r === "object") as Record<string, unknown>[]) : null;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "closed" | "no_profile" | "blocked" | "invalid" | "unauthorized" | "unavailable" };

const INVALID_MESSAGES = new Set(["bad_kind", "unknown_round", "bad_picks", "unknown_driver", "bad_extras", "unknown_team"]);

/** Коди бази: P0001 + message (prediction_closed, no_profile, blocked, bad_*), 28000 — не автентифікований, 23xxx — порушення обмежень. */
export async function savePrediction(cfg: PlayConfig, token: string, p: PredictionInput): Promise<SaveResult> {
  const res = await call(cfg, "rpc/save_prediction", {
    method: "POST",
    token,
    body: { p_year: p.year, p_round: p.round, p_kind: p.kind, p_picks: p.picks, p_dnf_team: p.dnfTeam, p_all_finish: p.allFinish },
  });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.ok) return { ok: true };
  // Не ввійшов — лише 401 (JWT недійсний) або код 28000 (auth.uid() порожній). 403 від PostgREST (42501: немає grant, схему play не
  // відкрито) — збій сервісу, а не «сесія закінчилась»: інакше здоровому гравцеві пропонують увійти знову (рев'ю 21.11, B).
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  const err = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (err?.code === "28000") return { ok: false, reason: "unauthorized" };
  if (err?.code === "P0001") {
    if (err.message === "prediction_closed") return { ok: false, reason: "closed" };
    if (err.message === "no_profile") return { ok: false, reason: "no_profile" };
    if (err.message === "blocked") return { ok: false, reason: "blocked" };
    if (err.message && INVALID_MESSAGES.has(err.message)) return { ok: false, reason: "invalid" };
  }
  if (typeof err?.code === "string" && err.code.startsWith("23")) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unavailable" };
}

/** Дедлайн вікенду (ISO) за годинником бази; null — невідомий (база вважає етап закритим). */
export async function getDeadline(cfg: PlayConfig, year: number, round: number): Promise<{ ok: true; deadline: string | null } | { ok: false }> {
  const res = await call(cfg, "rpc/deadline", { method: "POST", token: null, body: { p_year: year, p_round: round } });
  if (!res || !res.ok) return { ok: false };
  const v = (await res.json().catch(() => undefined)) as unknown;
  if (v === null) return { ok: true, deadline: null };
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? { ok: true, deadline: new Date(v).toISOString() } : { ok: false };
}

export type MyPrediction = { kind: PredictionKind; picks: Picks; dnfTeam: number | null; allFinish: boolean; updatedAt: string | null };

function kindOf(v: unknown): PredictionKind | null {
  return v === "Q" || v === "R" ? v : null;
}

/** Свої прогнози на етап (RLS: лише рядки гравця з токена). */
export async function getMyPredictions(cfg: PlayConfig, token: string, year: number, round: number): Promise<{ ok: true; rows: MyPrediction[] } | { ok: false }> {
  const list = await rows(
    await call(cfg, `predictions?select=kind,picks,dnf_team_id,all_finish,updated_at&season_year=eq.${year}&round=eq.${round}`, { method: "GET", token }),
  );
  if (!list) return { ok: false };
  const out: MyPrediction[] = [];
  for (const r of list) {
    const kind = kindOf(r.kind);
    const picks = normalizePicks(r.picks);
    if (!kind || !picks) continue;
    out.push({
      kind,
      picks,
      dnfTeam: isRowId(r.dnf_team_id) ? r.dnf_team_id : null,
      allFinish: r.all_finish === true,
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
    });
  }
  return { ok: true, rows: out };
}

export type RevealedPrediction = { kind: PredictionKind; player: string; picks: Picks; dnfTeam: number | null; allFinish: boolean; points: number | null };

/** Рядки подання за одним видом (кваліфікація/гонка) зі своїм лімітом; `extra` — додатковий фільтр (рядок «мого» гравця). */
async function revealedOfKind(cfg: PlayConfig, year: number, round: number, kind: PredictionKind, limit: number, extra = ""): Promise<RevealedPrediction[] | null> {
  const list = await rows(
    await call(
      cfg,
      `revealed_predictions?select=kind,player,picks,dnf_team_id,all_finish,points&season_year=eq.${year}&round=eq.${round}&kind=eq.${kind}${extra}&order=points.desc.nullslast,player.asc&limit=${limit}`,
      { method: "GET", token: null },
    ),
  );
  if (!list) return null;
  const out: RevealedPrediction[] = [];
  for (const r of list) {
    const k = kindOf(r.kind);
    const picks = normalizePicks(r.picks);
    if (!k || !picks || typeof r.player !== "string") continue;
    out.push({
      kind: k,
      player: r.player,
      picks,
      dnfTeam: isRowId(r.dnf_team_id) ? r.dnf_team_id : null,
      allFinish: r.all_finish === true,
      points: typeof r.points === "number" && Number.isFinite(r.points) ? r.points : null,
    });
  }
  return out;
}

/**
 * Прогнози всіх гравців ПІСЛЯ дедлайну (подання play.revealed_predictions; до дедлайну воно порожнє). Публічне подання:
 * є лише публічне ім'я (нік або «Гравець XXXX» для прихованих), без user_id й пошти. Спершу — за очками (оцінені), далі — за ніком.
 * Запит ПО ВИДУ (кожен зі своїм лімітом): один спільний limit на Q+R мовчки губив би рядки, а підпис «показано перших N» рахується
 * по виду (рев'ю 21.11, C). Якщо список виду заповнений до ліміту, а рядка гравця `me` (його публічне ім'я) в ньому немає, його
 * рядок докладається окремим запитом — гравець завжди бачить власний прогноз у таблиці.
 */
export async function getRevealed(cfg: PlayConfig, year: number, round: number, me: string | null = null, limit = REVEALED_LIMIT): Promise<{ ok: true; rows: RevealedPrediction[] } | { ok: false }> {
  const [q, r] = await Promise.all([revealedOfKind(cfg, year, round, "Q", limit), revealedOfKind(cfg, year, round, "R", limit)]);
  if (!q || !r) return { ok: false };
  const lists: Record<PredictionKind, RevealedPrediction[]> = { Q: q, R: r };
  if (me) {
    for (const kind of ["Q", "R"] as const) {
      if (lists[kind].length < limit || lists[kind].some((x) => x.player === me)) continue;
      const own = await revealedOfKind(cfg, year, round, kind, 1, `&player=eq.${encodeURIComponent(me)}`);
      if (own?.length) lists[kind] = [...lists[kind], ...own];
    }
  }
  return { ok: true, rows: [...lists.Q, ...lists.R] };
}
