import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { AdminEnv } from "./env";

/** Сесія адміна — підписаний JWT у httpOnly cookie (без бази). Перевірка: підпис, issuer/audience, строк, адмін у списку. */
export const SESSION_COOKIE = "ss_admin";
export const SESSION_TTL_S = 12 * 60 * 60;
/** Стан входу (PKCE, state, nonce) між переходом на Google і поверненням — 10 хв. */
export const FLOW_COOKIE = "ss_admin_flow";
export const FLOW_TTL_S = 10 * 60;

const ISS = "slipstream-admin";
const AUD_SESSION = "slipstream-admin/session";
const AUD_FLOW = "slipstream-admin/flow";

export type Flow = { verifier: string; state: string; nonce: string };

export async function signSession(env: AdminEnv, email: string, now = Date.now()): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISS)
    .setAudience(AUD_SESSION)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_TTL_S)
    .sign(env.secret);
}

/** null — немає, підроблена, прострочена сесія або e-mail більше не в списку адмінів. */
export async function verifySession(env: AdminEnv, token: string | undefined, now = Date.now()): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.secret, {
      algorithms: ["HS256"],
      issuer: ISS,
      audience: AUD_SESSION,
      currentDate: new Date(now),
      maxTokenAge: SESSION_TTL_S,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if ((payload.iat ?? 0) * 1000 < env.sessionsAfter) return null;
    return env.admins.has(email) ? { email } : null;
  } catch {
    return null;
  }
}

export async function signFlow(env: AdminEnv, flow: Flow, now = Date.now()): Promise<string> {
  return new SignJWT({ ...flow })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISS)
    .setAudience(AUD_FLOW)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + FLOW_TTL_S)
    .sign(env.secret);
}

export async function verifyFlow(env: AdminEnv, token: string | undefined, now = Date.now()): Promise<Flow | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.secret, {
      algorithms: ["HS256"],
      issuer: ISS,
      audience: AUD_FLOW,
      currentDate: new Date(now),
      maxTokenAge: FLOW_TTL_S,
    });
    const { verifier, state, nonce } = payload;
    return typeof verifier === "string" && typeof state === "string" && typeof nonce === "string" ? { verifier, state, nonce } : null;
  } catch {
    return null;
  }
}
