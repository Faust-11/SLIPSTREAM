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

export type AuthFailure = "invalid_email" | "invalid_code" | "rate_limited" | "captcha" | "bad_refresh" | "unavailable";
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

/** error_code і текст помилки GoTrue (нові версії — `error_code`, старі — `msg`/`error_description`). */
async function errorInfo(res: Response): Promise<{ code: string; text: string }> {
  const err = (await res.json().catch(() => null)) as { error_code?: unknown; code?: unknown; error_description?: unknown; msg?: unknown; message?: unknown } | null;
  const code = typeof err?.error_code === "string" ? err.error_code : typeof err?.code === "string" ? err.code : "";
  return { code, text: [err?.error_description, err?.msg, err?.message].filter((v) => typeof v === "string").join(" ") };
}
/** `over_email_send_rate_limit`, `over_request_rate_limit`, … — ліміти Supabase (приходять і як 429, і як 400). */
const isRateLimit = (status: number, code: string) => status === 429 || /^over_.*rate_limit$/.test(code);

/**
 * Лист із кодом. 200 для будь-якої адреси (створює користувача, якщо його немає); ліміт Supabase → rate_limited. «Не схоже на
 * адресу» — лише за `email_address_invalid` (чи `validation_failed` про пошту); решта 4xx (`signup_disabled`,
 * `email_provider_disabled`, `email_address_not_authorized`, …) — налаштування проєкту, а не помилка користувача: «unavailable».
 */
export async function sendCode(cfg: PlayConfig, email: string, captchaToken?: string | null): Promise<AuthResult<true>> {
  // Токен Turnstile (одноразовий) віддає перевіряти Supabase: gotrue_meta_security.captcha_token. Без токена поле не шлемо.
  const body = { email, create_user: true, ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}) };
  const res = await call(cfg, "/otp", { method: "POST", body });
  if (!res) return { ok: false, reason: "unavailable" };
  if (res.ok) return { ok: true, value: true };
  const { code, text } = await errorInfo(res);
  if (isRateLimit(res.status, code)) return { ok: false, reason: "rate_limited" };
  // CAPTCHA в Supabase ввімкнена, а токена нема чи він недійсний/використаний: `captcha_failed` (старі версії — текст про captcha).
  if (code === "captcha_failed" || (!code && res.status === 400 && /captcha/i.test(text))) return { ok: false, reason: "captcha" };
  const badEmail = code === "email_address_invalid" || (code === "validation_failed" && /email/i.test(text)) || (!code && /unable to validate email/i.test(text));
  if ((res.status === 400 || res.status === 422) && badEmail) return { ok: false, reason: "invalid_email" };
  return { ok: false, reason: "unavailable" };
}

/** «Невірний або прострочений код» — лише за `otp_expired`/`otp_invalid` (старі версії: 403 «Token has expired or is invalid»). */
export async function verifyCode(cfg: PlayConfig, email: string, token: string): Promise<AuthResult<Session>> {
  const res = await call(cfg, "/verify", { method: "POST", body: { type: "email", email, token } });
  if (!res) return { ok: false, reason: "unavailable" };
  if (!res.ok) {
    const { code, text } = await errorInfo(res);
    if (isRateLimit(res.status, code)) return { ok: false, reason: "rate_limited" };
    const badCode = code === "otp_expired" || code === "otp_invalid" || (!code && res.status === 403 && /expired|invalid/i.test(text));
    return { ok: false, reason: badCode ? "invalid_code" : "unavailable" };
  }
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
