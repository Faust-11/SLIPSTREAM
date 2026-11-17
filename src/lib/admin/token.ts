import "server-only";
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AdminEnv } from "./env";
import { sameKey } from "./local";

/**
 * Сесія адміна — підписаний JWT у httpOnly cookie (без бази). sub — «github:<id>» або «email:<адреса>»; при кожній
 * перевірці — що цей id/адреса досі в списку (прибрали — сесія більше не діє).
 */
export const SESSION_COOKIE = "ss_admin";
export const SESSION_TTL_S = 12 * 60 * 60;
/** Стан входу (GitHub: PKCE + state; пошта: адреса + хеш коду) — 10 хв, лише в цьому браузері. */
export const FLOW_COOKIE = "ss_admin_flow";
export const FLOW_TTL_S = 10 * 60;

const ISS = "slipstream-admin";
const AUD_SESSION = "slipstream-admin/session";
const AUD_FLOW = "slipstream-admin/flow";

export type Admin = { sub: string; label: string };
export type Flow = { kind: "github"; verifier: string; state: string } | { kind: "email"; email: string; codeHash: string };

/** Чи цей суб'єкт — адмін за поточною конфігурацією. */
export function isAdminSub(env: AdminEnv, sub: string): boolean {
  if (sub.startsWith("github:")) {
    const id = Number(sub.slice(7));
    return Number.isSafeInteger(id) && !!env.github?.ids.has(id);
  }
  if (sub.startsWith("email:")) return !!env.email?.emails.has(sub.slice(6));
  return false;
}

export async function signSession(env: AdminEnv, admin: Admin, now = Date.now()): Promise<string> {
  return new SignJWT({ label: admin.label })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISS)
    .setAudience(AUD_SESSION)
    .setSubject(admin.sub)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_TTL_S)
    .sign(env.secret);
}

/** null — немає, підроблена, прострочена, відкликана сесія або суб'єкта більше немає в списку. */
export async function verifySession(env: AdminEnv, token: string | undefined, now = Date.now()): Promise<Admin | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.secret, {
      algorithms: ["HS256"],
      issuer: ISS,
      audience: AUD_SESSION,
      currentDate: new Date(now),
      maxTokenAge: SESSION_TTL_S,
    });
    if ((payload.iat ?? 0) * 1000 < env.sessionsAfter) return null;
    const sub = payload.sub ?? "";
    if (!isAdminSub(env, sub)) return null;
    return { sub, label: typeof payload.label === "string" ? payload.label : sub };
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
    const { payload: p } = await jwtVerify(token, env.secret, {
      algorithms: ["HS256"],
      issuer: ISS,
      audience: AUD_FLOW,
      currentDate: new Date(now),
      maxTokenAge: FLOW_TTL_S,
    });
    if (p.kind === "github" && typeof p.verifier === "string" && typeof p.state === "string") return { kind: "github", verifier: p.verifier, state: p.state };
    if (p.kind === "email" && typeof p.email === "string" && typeof p.codeHash === "string") return { kind: "email", email: p.email, codeHash: p.codeHash };
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Код на пошту

/** Без схожих знаків (0/O, 1/I/L, 5/S, 2/Z): 27 символів, 8 знаків ≈ 2,8·10¹¹ варіантів. */
export const CODE_ALPHABET = "346789ABCDEFGHJKMNPQRTUVWXY";
export const CODE_LENGTH = 8;

export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // Відкидання (rejection sampling): байт ≥ найбільшого кратного розміру алфавіту — повтор, щоб не було перекосу.
  const max = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < max && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** «k7xq-m4pz», пробіли, дефіси, кирилиця-двійники латиниці — до канонічного вигляду; не з алфавіту — null. */
export function normalizeCode(input: string): string | null {
  const twins: Record<string, string> = { А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", Р: "P", Т: "T", Х: "X", У: "Y" };
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[АВСЕНКМРТХУ]/g, (c) => twins[c] ?? c);
  return s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Хеш коду в cookie стану: HMAC(ключ сесій, адреса + код) — сам код у браузері не зберігається. */
export function codeHash(env: AdminEnv, email: string, code: string): string {
  return createHmac("sha256", env.secret).update(`${email}\n${code}`).digest("base64url");
}

export function checkCode(env: AdminEnv, flow: Extract<Flow, { kind: "email" }>, input: string): boolean {
  const code = normalizeCode(input);
  return !!code && sameKey(codeHash(env, flow.email, code), flow.codeHash);
}
