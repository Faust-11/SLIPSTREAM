import "server-only";

/**
 * Налаштування входу відвідувачів: ті самі SUPABASE_URL і SUPABASE_ANON_KEY (ключ publishable), що й у читанні бази
 * (src/lib/data/db.ts) — нових змінних немає. Без них вхід вимкнено (обробники відповідають 503, інтерфейс — «тимчасово
 * недоступно»), а не падає збірка: статичні сторінки сайту від входу не залежать.
 */
export type PlayConfig = { url: string; key: string; issuer: string; jwks: string };

export function playConfig(env: Record<string, string | undefined> = process.env): PlayConfig | null {
  const raw = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY?.trim();
  if (!raw || !key) return null;
  return { url: raw, key, issuer: `${raw}/auth/v1`, jwks: `${raw}/auth/v1/.well-known/jwks.json` };
}
