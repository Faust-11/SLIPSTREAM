/**
 * Cloudflare Turnstile на формі входу (рішення 21.11). Токен перевіряє Supabase Auth (CAPTCHA protection), не наш сервер:
 * секрет лежить у Supabase, у нас — лише публічний ключ віджета NEXT_PUBLIC_TURNSTILE_SITE_KEY (задається на Vercel,
 * вживається при збірці). Без ключа віджета нема, токен не потрібен і все працює як раніше.
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

/** Публічний ключ віджета або null (порожній/пробіли = немає). Параметр env — для тестів. */
export function turnstileSiteKey(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return v ? v : null;
}

/** Токен Turnstile: до 2048 символів (документація Cloudflare); довший чи не рядок — не токен. */
export function cleanCaptchaToken(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= 2048 ? v : null;
}
