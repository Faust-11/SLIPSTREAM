import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { playConfig } from "../config";
import { SESSION_COOKIE, encodeSession } from "../cookie";

// currentPlayer читає cookie й заголовки Next: підставляємо власні.
let cookieValue: string | undefined;
let reqHeaders: Record<string, string> = {};
const written: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === SESSION_COOKIE && cookieValue ? { value: cookieValue } : undefined),
    set: (n: string, v: string) => void (written[n] = v),
  }),
  headers: async () => new Headers(reqHeaders),
}));

const { currentPlayer } = await import("../session");

const env = { SUPABASE_URL: "https://sess.supabase.test", SUPABASE_ANON_KEY: "k" };
const cfg = playConfig(env)!;
let priv: CryptoKey;
let jwk: object;
let tokenCalls: number;

async function jwt(opts: { exp: number; key?: CryptoKey; iss?: string }) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(opts.iss ?? cfg.issuer)
    .setAudience("authenticated")
    .setSubject("user-1")
    .setExpirationTime(opts.exp)
    .sign(opts.key ?? priv);
}
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  const a = await generateKeyPair("ES256", { extractable: true });
  priv = a.privateKey;
  jwk = { ...(await exportJWK(a.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
});

beforeEach(() => {
  process.env.SUPABASE_URL = env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  tokenCalls = 0;
  for (const k of Object.keys(written)) delete written[k];
  reqHeaders = {};
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/jwks.json")) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (url.includes("/token?grant_type=refresh_token")) {
      tokenCalls++;
      // Supabase приймає лише справжній refresh-токен (тут "R1").
      if (!String((init as RequestInit | undefined)?.body).includes('"R1"')) return new Response(JSON.stringify({ error_code: "refresh_token_not_found" }), { status: 400 });
      return new Response(JSON.stringify({ access_token: await jwt({ exp: now() + 3600 }), refresh_token: "R2", expires_in: 3600 }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("currentPlayer: виклики Supabase за cookie (рев'ю 20.11, знахідка 2)", () => {
  it("сміттєва cookie {a:'x',r:'y'} не породжує запиту /token — аноним, cookie знято", async () => {
    cookieValue = encodeSession({ a: "x", r: "y" });
    const state = await currentPlayer();
    expect(state).toMatchObject({ user: null, unavailable: false });
    expect(tokenCalls).toBe(0);
    expect(written[SESSION_COOKIE]).toBe("");
  });
  it("токен нашого проєкту, але alg поза ES256/RS256 (HS256 — відкат ключів): «недоступно», БЕЗ зняття cookie й БЕЗ refresh", async () => {
    const secret = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hs = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(cfg.issuer)
      .setAudience("authenticated")
      .setSubject("user-1")
      .setExpirationTime(now() + 3600)
      .sign(secret);
    cookieValue = encodeSession({ a: hs, r: "R1" });
    reqHeaders = { "x-real-ip": "203.0.113.79" };
    const state = await currentPlayer();
    expect(state).toMatchObject({ user: null, unavailable: true });
    expect(tokenCalls).toBe(0); // одноразовий refresh-токен не ротуємо даремно
    expect(SESSION_COOKIE in written).toBe(false); // сесію не знято: вхід не «успішний, але одразу скинутий», код не горить
  });
  it("підроблений токен зі «схожою» структурою й нашим issuer: запитів /token з одного джерела — не більше 30 за 10 хв", async () => {
    const other = (await generateKeyPair("ES256")).privateKey;
    cookieValue = encodeSession({ a: await jwt({ exp: now() + 3600, key: other }), r: "y" });
    reqHeaders = { "x-real-ip": "203.0.113.77" };
    for (let i = 0; i < 80; i++) await currentPlayer();
    expect(tokenCalls).toBeLessThanOrEqual(30);
  });
  it("справжній прострочений токен нашого проєкту → оновлення за refresh, нова пара в cookie (сценарій не зламано)", async () => {
    cookieValue = encodeSession({ a: await jwt({ exp: now() - 600 }), r: "R1" });
    reqHeaders = { "x-real-ip": "203.0.113.78" };
    const state = await currentPlayer();
    expect(tokenCalls).toBe(1);
    expect(state).toMatchObject({ user: { userId: "user-1" }, unavailable: false });
    expect(written[SESSION_COOKIE]).toBeTruthy();
  });
  it("чинний токен — без запитів у Supabase", async () => {
    cookieValue = encodeSession({ a: await jwt({ exp: now() + 3600 }), r: "R1" });
    const state = await currentPlayer();
    expect(state).toMatchObject({ user: { userId: "user-1" } });
    expect(tokenCalls).toBe(0);
  });
});
