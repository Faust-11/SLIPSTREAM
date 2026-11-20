import "server-only";
import type { PlayConfig } from "./config";

/**
 * Supabase Auth (GoTrue) REST — звичайний fetch, без SDK; лише з сервера (браузер із Supabase не говорить, CSP connect-src
 * лишається 'self'). Ключ publishable — у заголовку apikey (не JWT, у Authorization не йде).
 * Факти (docs openapi.yaml + код supabase/auth verify.go, 19.11): POST /otp {email, create_user}; POST /verify
 * {type:"email", email, token} (для нового й наявного користувача), невірний/прострочений код — 403 error_code
 * otp_expired; POST /token?grant_type=refresh_token {refresh_token}; POST /logout?scope=local (Bearer); 429 — ліміти.
 */
export type Session = { access_token: string; refresh_token: string; expires_in: number };

export type AuthFailure = "invalid_email" | "invalid_code" | "rate_limited" | "bad_refresh" | "unavailable";
export type AuthResult<T> = { ok: true; value: T } | { ok: false; reason: AuthFailure };

const TIMEOUT_MS = 8000;
/** error_code GoTrue, що означають «refresh-токен/сесія/користувач недійсні». */
const REVOKED_CODES = new Set(["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "user_not_found"]);

async function call(cfg: PlayConfig, path: string, init: { method: string; body?: unknown; bearer?: string }): Promise<Response | null> {
  try {
    return await fetch(`${cfg.url}/auth/v1${path}`, {
      method: init.method,
      headers: {
        apikey: cfg.key,
        "content-type": "application/json",
        ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

function asSession(v: unknown): Session | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  return typeof s.access_token === "string" && typeof s.refresh_token === "string"
    ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: typeof s.expires_in === "number" ? s.expires_in : 3600 }
    : null;
}

/** Лист із кодом. 200 для будь-якої адреси (створює користувача, якщо його немає); 429 — ліміт Supabase на адресу/проєкт. */
export async function sendCode(cfg: PlayConfig, email: string): Promise<AuthResult<true>> {
  const res = await call(cfg, "/otp", { method: "POST", body: { email, create_user: true } });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.ok) return { ok: true, value: true };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 400 || res.status === 422) return { ok: false, reason: "invalid_email" };
  return { ok: false, reason: "unavailable" };
}

export async function verifyCode(cfg: PlayConfig, email: string, token: string): Promise<AuthResult<Session>> {
  const res = await call(cfg, "/verify", { method: "POST", body: { type: "email", email, token } });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 403 || res.status === 400 || res.status === 422) return { ok: false, reason: "invalid_code" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const session = asSession(await res.json().catch(() => null));
  return session ? { ok: true, value: session } : { ok: false, reason: "unavailable" };
}

export async function refreshSession(cfg: PlayConfig, refreshToken: string): Promise<AuthResult<Session>> {
  const res = await call(cfg, "/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
  if (!res) return { ok: false, reason: "unavailable" };
  if (!res.ok) {
    // «Сесії більше немає» — лише за відповідями про сам refresh-токен/сесію/користувача (400/403 з error_code). Усе інше —
    // 401 «Invalid API key» (ключ ротовано чи не задано на Vercel), 422, 429, 5xx, мережа — збій розгортання/сервісу, не
    // відкликання: користувача НЕ розлогінюємо (рев'ю 20.11).
    const err = (await res.json().catch(() => null)) as { error_code?: unknown; code?: unknown; error?: unknown; error_description?: unknown; msg?: unknown } | null;
    const code = typeof err?.error_code === "string" ? err.error_code : typeof err?.code === "string" ? err.code : "";
    const text = `${err?.error_description ?? ""} ${err?.msg ?? ""}`;
    const revoked = REVOKED_CODES.has(code) || ((res.status === 400 || res.status === 403) && /refresh token|session.*(not found|expired)|user.*not found/i.test(text));
    return { ok: false, reason: revoked && (res.status === 400 || res.status === 401 || res.status === 403) ? "bad_refresh" : "unavailable" };
  }
  const session = asSession(await res.json().catch(() => null));
  return session ? { ok: true, value: session } : { ok: false, reason: "unavailable" };
}

/** Найкращим зусиллям: cookie однаково знімаємо, навіть якщо Supabase недоступний. */
export async function revokeSession(cfg: PlayConfig, accessToken: string): Promise<void> {
  await call(cfg, "/logout?scope=local", { method: "POST", bearer: accessToken });
}
