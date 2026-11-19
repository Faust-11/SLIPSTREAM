import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { PlayConfig } from "./config";

/**
 * Перевірка access-токена Supabase локально за публічними ключами проєкту (JWKS). Замір 19.11: проєкт підписує ES256
 * (jwks.json — 1 ключ P-256, 0,43 с холодний запит, далі кеш jose); виклик /auth/v1/user на кожен запит коштував би
 * ~90 мс мережі. Токен із старим симетричним ключем (HS256) не проходить — fail closed: користувача просто розлогінить.
 */
export type Access = { userId: string; exp: number };

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
