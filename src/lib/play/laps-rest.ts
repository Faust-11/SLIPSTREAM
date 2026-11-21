import "server-only";
import type { PlayConfig } from "./config";
import type { TrackKey } from "@/lib/game/physics";

/**
 * PostgREST схеми play для таблиці лідерів гри (міграція 0017). Запис — лише play.save_lap від імені гравця (його JWT:
 * auth.uid()) і з секретом нашого сервера (GAME_LAP_SECRET, збігається зі значенням play.secrets.lap_secret): час кола база
 * перевірити не може, тому приймає його лише від сервера, що повторив заїзд (src/lib/game/lap-check.ts).
 * Читання — публічне подання play.lap_board (нік, час, дата; без user_id) з ключем publishable в apikey.
 */
type Call = { method: "GET" | "POST"; token: string | null; body?: unknown; prefer?: string };

async function call(cfg: PlayConfig, path: string, init: Call): Promise<Response | null> {
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: init.method,
      headers: {
        apikey: cfg.key,
        accept: "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.prefer ? { prefer: init.prefer } : {}),
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

export type LapSaved = { saved: boolean; ticks: number; jump: boolean; place: number };
export type SaveLapResult = { ok: true; lap: LapSaved } | { ok: false; reason: "no_profile" | "blocked" | "invalid" | "unauthorized" | "unavailable" };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function lapOf(v: unknown): LapSaved | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!o || !isInt(o.ticks) || !isInt(o.place)) return null;
  return { saved: o.saved === true, ticks: o.ticks, jump: o.jump === true, place: o.place };
}

/**
 * Коди бази: P0001 + message (no_profile, blocked), 28000 — без входу, 23xxx — траса чи час поза межами форми. 42501 forbidden
 * (секрет не збігся) і 55000 not_configured (секрет у базі не задано) — це налаштування, а не вина гравця: «недоступно».
 */
export async function saveLap(
  cfg: PlayConfig,
  token: string,
  secret: string,
  lap: { track: TrackKey; ticks: number; jump: boolean; inputs: string },
): Promise<SaveLapResult> {
  const res = await call(cfg, "rpc/save_lap", {
    method: "POST",
    token,
    body: { p_secret: secret, p_track: lap.track, p_ticks: lap.ticks, p_jump: lap.jump, p_inputs: lap.inputs },
  });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.ok) {
    const parsed = lapOf(await res.json().catch(() => null));
    return parsed ? { ok: true, lap: parsed } : { ok: false, reason: "unavailable" };
  }
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  const err = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (err?.code === "28000") return { ok: false, reason: "unauthorized" };
  if (err?.code === "P0001") {
    if (err.message === "no_profile") return { ok: false, reason: "no_profile" };
    if (err.message === "blocked") return { ok: false, reason: "blocked" };
  }
  if (typeof err?.code === "string" && err.code.startsWith("23")) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unavailable" };
}

/** Моє найкраще коло на трасі й місце; null — кола ще немає. */
export async function getMyLap(cfg: PlayConfig, token: string, track: TrackKey): Promise<{ ok: true; lap: Omit<LapSaved, "saved"> | null } | { ok: false }> {
  const res = await call(cfg, "rpc/my_lap", { method: "POST", token, body: { p_track: track } });
  if (!res || !res.ok) return { ok: false };
  const v = (await res.json().catch(() => undefined)) as unknown;
  if (v === null) return { ok: true, lap: null };
  const lap = lapOf(v);
  return lap ? { ok: true, lap: { ticks: lap.ticks, jump: lap.jump, place: lap.place } } : { ok: false };
}

export type BoardRow = { place: number; player: string; ticks: number; jump: boolean; at: string };
export const BOARD_LIMIT = 10;

/** Топ-N траси з публічного подання (однаковий час — однакове місце) і кількість гравців на трасі. */
export async function getBoard(cfg: PlayConfig, track: TrackKey, limit = BOARD_LIMIT): Promise<{ ok: true; rows: BoardRow[]; total: number } | { ok: false }> {
  const res = await call(cfg, `lap_board?select=place,player,ticks,jump,set_at&track=eq.${track}&order=ticks.asc,set_at.asc&limit=${limit}`, {
    method: "GET",
    token: null,
    prefer: "count=exact",
  });
  if (!res || !res.ok) return { ok: false };
  const list = (await res.json().catch(() => null)) as Record<string, unknown>[] | null;
  if (!Array.isArray(list)) return { ok: false };
  const rows: BoardRow[] = [];
  for (const r of list) {
    if (!isInt(r.place) || !isInt(r.ticks) || typeof r.player !== "string" || typeof r.set_at !== "string") continue;
    rows.push({ place: r.place, player: r.player, ticks: r.ticks, jump: r.jump === true, at: r.set_at });
  }
  const range = res.headers.get("content-range"); // «0-9/37»
  const total = Number(range?.split("/")[1]);
  return { ok: true, rows, total: Number.isSafeInteger(total) && total >= rows.length ? total : rows.length };
}
