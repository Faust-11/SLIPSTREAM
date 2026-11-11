import "server-only";

/**
 * Читання бази Slipstream (Supabase, схема f1) через PostgREST — звичайний fetch, без SDK.
 * Лише на сервері: під час `next build` (статичні сторінки; дані оновлюються перезбіркою після синхронізації,
 * docs fetch.md — `auto no cache` = один запит під час збірки). Ключ publishable (роль anon): читання опублікованого через RLS.
 */
const VIEW_RE = /^[a-z_]+$/;

export async function dbSelect<T>(view: string, query: string): Promise<T[]> {
  if (!VIEW_RE.test(view)) throw new Error(`Некоректна назва подання: ${view}`);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error("SUPABASE_URL не задано (Vercel → Environment Variables; локально — .env.local)");
  if (!key) throw new Error("SUPABASE_ANON_KEY не задано (Vercel → Environment Variables; локально — .env.local)");
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${view}?${query}`, {
    // Ключ publishable (sb_publishable_…) — лише в заголовку apikey: це не JWT, у Authorization: Bearer його не передають
    // (docs Supabase «API keys»). Legacy anon (JWT) Supabase вимикає до кінця 2026 — тому publishable.
    headers: { apikey: key, "accept-profile": "f1", accept: "application/json" },
  });
  if (!res.ok) throw new Error(`База: ${view} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as T[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`База: ${view} — порожня відповідь`);
  return rows;
}
