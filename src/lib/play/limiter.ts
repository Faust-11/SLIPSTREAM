import "server-only";

/**
 * М'який обмежувач у пам'яті інстанса: НЕ межа безпеки (на Vercel інстансів багато, пам'ять скидається), а відсікання
 * очевидного перебору коду й розсилки з одного джерела. Справжні ліміти — у Supabase Auth (пауза на адресу, листи на
 * годину по проєкту); CAPTCHA (Turnstile) — можливий наступний крок.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

/** true — дозволено (і зараховано); false — ліміт вичерпано. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= MAX_KEYS / 2) break; }
  return true;
}

/**
 * Джерело запиту: заголовок платформи (Vercel: x-vercel-forwarded-for, x-real-ip, x-forwarded-for). null — довіреної адреси немає
 * (локальний next start без проксі): ліміт за джерелом тоді ПРОПУСКАЄМО, а не збираємо всіх в один спільний кошик — інакше 8 запитів
 * від будь-кого вичерпали б вхід для всіх (рев'ю 20.11).
 */
export function clientKey(request: Request): string | null {
  const h = request.headers;
  const v = h.get("x-vercel-forwarded-for") || h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "";
  return v.trim() || null;
}

/** Ліміт за джерелом; без відомого джерела — дозволено. */
export function allowFrom(request: Request, name: string, limit: number, windowMs: number): boolean {
  const ip = clientKey(request);
  return ip ? allow(`${name}:ip:${ip}`, limit, windowMs) : true;
}
