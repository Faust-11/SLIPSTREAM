import "server-only";

/**
 * Читання бази Outlap (Supabase, схема f1) через PostgREST — звичайний fetch, без SDK.
 * Лише на сервері: під час `next build` (статичні сторінки; дані оновлюються перезбіркою після синхронізації,
 * docs fetch.md — `auto no cache` = один запит під час збірки). Ключ publishable (роль anon): читання опублікованого через RLS.
 */
const VIEW_RE = /^[a-z_]+$/;

function request(view: string, query: string, extra: Record<string, string> = {}): Promise<Response> {
  if (!VIEW_RE.test(view)) throw new Error(`Некоректна назва подання: ${view}`);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error("SUPABASE_URL не задано (Vercel → Environment Variables; локально — .env.local)");
  if (!key) throw new Error("SUPABASE_ANON_KEY не задано (Vercel → Environment Variables; локально — .env.local)");
  return fetch(`${url.replace(/\/$/, "")}/rest/v1/${view}?${query}`, {
    // Ключ publishable (sb_publishable_…) — лише в заголовку apikey: це не JWT, у Authorization: Bearer його не передають
    // (docs Supabase «API keys»). Legacy anon (JWT) Supabase вимикає до кінця 2026 — тому publishable.
    headers: { apikey: key, "accept-profile": "f1", accept: "application/json", ...extra },
  });
}

async function rowsOf<T>(view: string, res: Response): Promise<T[]> {
  if (!res.ok) throw new Error(`База: ${view} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as T[];
  if (!Array.isArray(rows)) throw new Error(`База: ${view} — відповідь не масив`);
  return rows;
}

export async function dbSelect<T>(view: string, query: string): Promise<T[]> {
  const rows = await rowsOf<T>(view, await request(view, query));
  if (rows.length === 0) throw new Error(`База: ${view} — порожня відповідь`);
  return rows;
}

/**
 * Усі рядки подання сторінками. PostgREST Supabase віддає не більше `max-rows` (типово 1000) за запит і мовчки
 * обрізає решту; тому — `limit/offset` з обов'язковим `order` і загальна кількість з `Prefer: count=exact`
 * (заголовок Content-Range «0-999/1154»): збірка падає, якщо зібрано не стільки, скільки є в базі.
 */
export async function dbSelectAll<T>(view: string, query: string, pageSize = 1000): Promise<T[]> {
  if (!/(^|&)order=/.test(query)) throw new Error(`dbSelectAll(${view}): потрібен order= — інакше сторінки нестабільні`);
  const all: T[] = [];
  let total: number | null = null;
  do {
    const res = await request(view, `${query}&limit=${pageSize}&offset=${all.length}`, { prefer: "count=exact" });
    const page = await rowsOf<T>(view, res);
    const range = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
    if (!range) throw new Error(`База: ${view} — немає загальної кількості (Content-Range)`);
    total = Number(range[1]);
    if (page.length === 0) break;
    all.push(...page);
  } while (all.length < total);
  if (all.length === 0) throw new Error(`База: ${view} — порожня відповідь`);
  if (all.length !== total) throw new Error(`База: ${view} — зібрано ${all.length} з ${total} рядків`);
  return all;
}
