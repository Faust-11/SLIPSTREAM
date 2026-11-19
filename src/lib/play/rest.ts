import "server-only";
import type { PlayConfig } from "./config";

/**
 * PostgREST схеми play від імені гравця: access-токен у Authorization (роль authenticated, RLS і auth.uid() — на боці
 * бази), схема — Accept-Profile / Content-Profile: play. Схему play треба додати в Supabase → Settings → API → Exposed
 * schemas (інакше PostgREST відповідає 406 PGRST106 — тут це «unavailable»).
 */
export type Profile = { nick: string; publicName: string };
export type NickResult = { ok: true } | { ok: false; reason: "taken" | "invalid" | "blocked" | "unauthorized" | "unavailable" };
export type DeleteResult = { ok: true; kind: "deleted" | "data_only_blocked" } | { ok: false; reason: "unauthorized" | "unavailable" };

async function rest(cfg: PlayConfig, token: string, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Response | null> {
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: init.method,
      headers: {
        apikey: cfg.key,
        authorization: `Bearer ${token}`,
        accept: "application/json",
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

/** Свій профіль (RLS profiles_own_select): null — профілю ще немає; кидає лише при збої бази. */
export async function getProfile(cfg: PlayConfig, token: string): Promise<{ ok: true; profile: Profile | null } | { ok: false }> {
  const res = await rest(cfg, token, "profiles?select=nick,public_name&limit=1", { method: "GET" });
  if (!res || !res.ok) return { ok: false };
  const rows = (await res.json().catch(() => null)) as { nick?: unknown; public_name?: unknown }[] | null;
  if (!Array.isArray(rows)) return { ok: false };
  const row = rows[0];
  return { ok: true, profile: row && typeof row.nick === "string" ? { nick: row.nick, publicName: typeof row.public_name === "string" ? row.public_name : row.nick } : null };
}

/** Коди бази: 23505 — нік зайнятий (унікальний індекс), 23514 — не пройшов перевірку формату, P0001 «blocked» — блокування. */
export async function setNick(cfg: PlayConfig, token: string, nick: string): Promise<NickResult> {
  const res = await rest(cfg, token, "rpc/set_nick", { method: "POST", body: { p_nick: nick } });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized" };
  const err = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (err?.code === "23505") return { ok: false, reason: "taken" };
  if (err?.code === "23514") return { ok: false, reason: "invalid" };
  if (err?.code === "P0001" && err.message === "blocked") return { ok: false, reason: "blocked" };
  if (err?.code === "28000") return { ok: false, reason: "unauthorized" };
  return { ok: false, reason: "unavailable" };
}

export async function deleteAccount(cfg: PlayConfig, token: string): Promise<DeleteResult> {
  const res = await rest(cfg, token, "rpc/delete_my_account", { method: "POST", body: {} });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const kind = await res.json().catch(() => null);
  return kind === "deleted" || kind === "data_only_blocked" ? { ok: true, kind } : { ok: false, reason: "unavailable" };
}
