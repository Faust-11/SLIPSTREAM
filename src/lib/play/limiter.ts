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

export function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}
