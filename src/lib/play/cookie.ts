/**
 * Сесія відвідувача — окрема від адмінської (ss_admin, Path=/admin, src/lib/admin). Префікс __Host-: Secure, Path=/, без
 * Domain — cookie не можна підмінити з піддомену. У ній пара токенів Supabase Auth (access JWT + refresh): сервер перевіряє
 * підпис access за JWKS проєкту й оновлює його за refresh (src/lib/play/session.ts). httpOnly — скрипти сторінки токенів
 * не бачать. Окрема НЕ httpOnly позначка OUTLAP_IN_COOKIE (лише «1») каже клієнту, чи варто питати /api/session —
 * анонімний відвідувач зайвих запитів не робить.
 */
export const SESSION_COOKIE = "__Host-outlap_s";
export const SIGNED_IN_COOKIE = "outlap_in";
/** Refresh-токен Supabase не спливає сам; cookie тримаємо ковзно (кожне оновлення подовжує) — 30 діб. */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export type TokenPair = { a: string; r: string };

export function encodeSession(pair: TokenPair): string {
  return Buffer.from(JSON.stringify(pair), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined): TokenPair | null {
  if (!raw || raw.length > 6000) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!v || typeof v !== "object") return null;
    const { a, r } = v as Record<string, unknown>;
    return typeof a === "string" && typeof r === "string" && a.length > 0 && r.length > 0 ? { a, r } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Secure і на http://localhost: браузери вважають localhost захищеним контекстом (як у адмінці).
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_S,
};

export const flagCookieOptions = { httpOnly: false, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE_S };
