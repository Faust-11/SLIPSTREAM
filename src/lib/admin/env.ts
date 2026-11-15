import "server-only";

/**
 * Налаштування адмінки (фаза 7) — лише змінні середовища сервера. Будь-яка помилка конфігурації = адмінки немає
 * (усі адреси /admin/** — 404), а не «вхід без перевірки» (fail closed).
 *
 * ADMIN_EMAILS          — e-mail адмінів через кому (Google, email_verified).
 * ADMIN_AUTH_SECRET     — ключ підпису сесії, ≥ 32 символи.
 * ADMIN_GOOGLE_CLIENT_ID / ADMIN_GOOGLE_CLIENT_SECRET — клієнт OAuth у Google Cloud Console.
 * ADMIN_OIDC_ISSUER     — лише для e2e (фейковий провайдер на localhost); на Vercel дозволено тільки Google.
 */
export const GOOGLE_ISSUER = "https://accounts.google.com";

export type AdminEnv = {
  issuer: URL;
  /** http дозволено лише фейковому провайдеру на localhost. */
  insecureIssuer: boolean;
  clientId: string;
  clientSecret: string;
  secret: Uint8Array;
  admins: ReadonlySet<string>;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseAdminEnv(env: Record<string, string | undefined>): AdminEnv | null {
  const admins = new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  );
  const secret = env.ADMIN_AUTH_SECRET ?? "";
  const clientId = env.ADMIN_GOOGLE_CLIENT_ID ?? "";
  const clientSecret = env.ADMIN_GOOGLE_CLIENT_SECRET ?? "";
  if (admins.size === 0 || secret.length < 32 || !clientId || !clientSecret) return null;

  let issuer: URL;
  try {
    issuer = new URL(env.ADMIN_OIDC_ISSUER || GOOGLE_ISSUER);
  } catch {
    return null;
  }
  const isGoogle = issuer.href.replace(/\/$/, "") === GOOGLE_ISSUER;
  // Інший провайдер — лише локальний фейк для e2e і ніколи на Vercel.
  if (!isGoogle && (env.VERCEL === "1" || !LOCAL_HOSTS.has(issuer.hostname))) return null;
  if (issuer.protocol !== "https:" && !(issuer.protocol === "http:" && LOCAL_HOSTS.has(issuer.hostname))) return null;

  return {
    issuer,
    insecureIssuer: issuer.protocol === "http:",
    clientId,
    clientSecret,
    secret: new TextEncoder().encode(secret),
    admins,
  };
}

export function adminEnv(): AdminEnv | null {
  return parseAdminEnv(process.env);
}
