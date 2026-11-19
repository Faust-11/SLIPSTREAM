import "server-only";
import { LOCAL_HOSTS } from "./local";

export { sameKey } from "./local";

/**
 * Налаштування адмінки (фаза 7) — лише змінні середовища сервера. Будь-яка помилка конфігурації = адмінки немає
 * (усі адреси /admin/** — 404), а не «вхід без перевірки» (fail closed). Вхід — два способи (рішення користувача 17.11):
 * GitHub і код на пошту; кожен вмикається, лише коли всі його змінні задані, і потрібен хоча б один.
 *
 * Спільне:
 *   ADMIN_AUTH_SECRET     — ключ підпису сесії й стану входу, ≥ 32 символи.
 *   ADMIN_LOGIN_KEY       — ≥ 16 символів: вхід лише за адресою /admin/auth/login?key=<ключ> (без ключа — 404).
 *   ADMIN_SESSIONS_AFTER  — необов'язково, ISO-дата: сесії, видані раніше, недійсні («вийти на всіх пристроях»).
 * GitHub (OAuth App):
 *   ADMIN_GITHUB_CLIENT_ID / ADMIN_GITHUB_CLIENT_SECRET, ADMIN_GITHUB_IDS — числові id акаунтів через кому
 *   (id не змінюється, логін — може).
 * Код на пошту (Resend):
 *   ADMIN_EMAILS — адреси через кому; ADMIN_RESEND_KEY — ключ API; ADMIN_MAIL_FROM — відправник
 *   (за замовчуванням onboarding@resend.dev — без свого домену Resend доставляє лише на адресу власника акаунта).
 * Лише для e2e (фейкові сервіси на localhost, ніколи на Vercel): ADMIN_GITHUB_OAUTH_BASE, ADMIN_RESEND_API.
 */

export type GitHubLogin = {
  authorize: string;
  token: string;
  /** Базова адреса API (/user). */
  api: string;
  clientId: string;
  clientSecret: string;
  ids: ReadonlySet<number>;
  /** http — лише фейк на localhost. */
  insecure: boolean;
};

export type EmailLogin = { api: string; apiKey: string; from: string; emails: ReadonlySet<string> };

export type AdminEnv = {
  secret: Uint8Array;
  loginKey: string;
  /** мс; сесії з iat раніше — недійсні. */
  sessionsAfter: number;
  github: GitHubLogin | null;
  email: EmailLogin | null;
};

const EMAIL_RE = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/** Адреса фейкового сервісу: undefined — не задано; null — задано, але не дозволено (= адмінки немає). */
function localOverride(value: string | undefined, env: Record<string, string | undefined>): URL | null | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (env.VERCEL === "1" || !LOCAL_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseAdminEnv(env: Record<string, string | undefined>): AdminEnv | null {
  const secret = env.ADMIN_AUTH_SECRET ?? "";
  const loginKey = env.ADMIN_LOGIN_KEY ?? "";
  const sessionsAfter = env.ADMIN_SESSIONS_AFTER ? Date.parse(env.ADMIN_SESSIONS_AFTER) : 0;
  if (secret.length < 32 || loginKey.length < 16 || Number.isNaN(sessionsAfter)) return null;

  // GitHub
  const ghBase = localOverride(env.ADMIN_GITHUB_OAUTH_BASE, env);
  if (ghBase === null) return null;
  const ids = new Set(
    (env.ADMIN_GITHUB_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{1,12}$/.test(s))
      .map(Number),
  );
  const github: GitHubLogin | null =
    env.ADMIN_GITHUB_CLIENT_ID && env.ADMIN_GITHUB_CLIENT_SECRET && ids.size > 0
      ? {
          authorize: ghBase ? new URL("/login/oauth/authorize", ghBase).href : "https://github.com/login/oauth/authorize",
          token: ghBase ? new URL("/login/oauth/access_token", ghBase).href : "https://github.com/login/oauth/access_token",
          api: ghBase ? ghBase.origin : "https://api.github.com",
          clientId: env.ADMIN_GITHUB_CLIENT_ID,
          clientSecret: env.ADMIN_GITHUB_CLIENT_SECRET,
          ids,
          insecure: ghBase?.protocol === "http:",
        }
      : null;

  // Код на пошту
  const mailApi = localOverride(env.ADMIN_RESEND_API, env);
  if (mailApi === null) return null;
  const emails = new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e)),
  );
  const from = env.ADMIN_MAIL_FROM?.trim() || "Outlap <onboarding@resend.dev>";
  const email: EmailLogin | null =
    env.ADMIN_RESEND_KEY && emails.size > 0 ? { api: mailApi ? mailApi.origin : "https://api.resend.com", apiKey: env.ADMIN_RESEND_KEY, from, emails } : null;

  if (!github && !email) return null;
  return { secret: new TextEncoder().encode(secret), loginKey, sessionsAfter, github, email };
}

export function adminEnv(): AdminEnv | null {
  return parseAdminEnv(process.env);
}
