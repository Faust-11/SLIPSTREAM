import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { PlayConfig } from "./config";

/**
 * Перевірка access-токена Supabase локально за публічними ключами проєкту (JWKS). Замір 19.11: проєкт підписує ES256
 * (jwks.json — 1 ключ P-256, 0,43 с холодний запит, далі кеш jose); виклик /auth/v1/user на кожен запит коштував би
 * ~90 мс мережі. Токен із старим симетричним ключем (HS256) не проходить — fail closed: підпис не збігається, тож access недійсний,
 * сайт пробує оновити його за refresh; новий токен теж HS256 → не проходить → користувач бачить «недоступно» (session.ts), сесію
 * не знято (це збій налаштувань проєкту, а не відкликання).
 */
export type Access = { userId: string; exp: number };

/**
 * Дешева перевірка БЕЗ підпису: чи схожий рядок на access-токен НАШОГО проєкту (три сегменти, дозволений alg, наш issuer, aud
 * `authenticated`, sub і exp). Це не безпека (підробити таку «обкладинку» легко, issuer публічний) — лише відсікання сміття перед
 * дорогим викликом refresh у GoTrue; рівень зловживання тримає обмежувач у session.ts. Прострочення тут свідомо НЕ вимагаємо: після
 * ротації ключів проєкту справжній токен із майбутнім exp не пройде підпис, і саме refresh видасть новий.
 */
export function looksLikeOurAccess(cfg: PlayConfig, token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const head = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")) as { alg?: unknown };
    const body = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown };
    return (
      (head.alg === "ES256" || head.alg === "RS256") &&
      body.iss === cfg.issuer &&
      body.aud === "authenticated" &&
      typeof body.sub === "string" &&
      typeof body.exp === "number"
    );
  } catch {
    return false;
  }
}

const sets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(cfg: PlayConfig) {
  let set = sets.get(cfg.jwks);
  if (!set) {
    set = createRemoteJWKSet(new URL(cfg.jwks), { timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
    sets.set(cfg.jwks, set);
  }
  return set;
}

export async function verifyAccess(cfg: PlayConfig, token: string, now = Date.now()): Promise<Access | null> {
  try {
    const { payload } = await jwtVerify(token, jwksFor(cfg), {
      issuer: cfg.issuer,
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
      clockTolerance: 5,
      currentDate: new Date(now),
    });
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}
