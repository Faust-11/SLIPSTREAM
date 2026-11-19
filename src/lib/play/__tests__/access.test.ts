import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyAccess } from "../access";
import { playConfig } from "../config";

const cfg = playConfig({ SUPABASE_URL: "https://jwks.supabase.test", SUPABASE_ANON_KEY: "k" })!;
let priv: CryptoKey;
let other: CryptoKey;

async function sign(key: CryptoKey, claims: { iss?: string; aud?: string; exp?: number; sub?: string | null } = {}, alg = "ES256") {
  const jwt = new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg, kid: "k1" })
    .setIssuer(claims.iss ?? cfg.issuer)
    .setAudience(claims.aud ?? "authenticated")
    .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 3600);
  if (claims.sub !== null) jwt.setSubject(claims.sub ?? "user-1");
  return jwt.sign(key);
}

beforeAll(async () => {
  const a = await generateKeyPair("ES256", { extractable: true });
  const b = await generateKeyPair("ES256");
  priv = a.privateKey;
  other = b.privateKey;
  const jwk = { ...(await exportJWK(a.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "content-type": "application/json" } }));
});
afterEach(() => undefined);

describe("verifyAccess (JWKS проєкту)", () => {
  it("дійсний токен → id користувача й exp", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(await verifyAccess(cfg, await sign(priv, { exp, sub: "abc" }))).toEqual({ userId: "abc", exp });
  });
  it("чужий підпис, інший issuer/audience, прострочений, без sub, сміття — null", async () => {
    expect(await verifyAccess(cfg, await sign(other))).toBeNull();
    expect(await verifyAccess(cfg, await sign(priv, { iss: "https://evil.test/auth/v1" }))).toBeNull();
    expect(await verifyAccess(cfg, await sign(priv, { aud: "anon" }))).toBeNull();
    expect(await verifyAccess(cfg, await sign(priv, { exp: Math.floor(Date.now() / 1000) - 600 }))).toBeNull();
    expect(await verifyAccess(cfg, await sign(priv, { sub: null }))).toBeNull();
    expect(await verifyAccess(cfg, "not.a.jwt")).toBeNull();
  });
  it("симетричний HS256 (старий ключ проєкту) не приймається — fail closed", async () => {
    const secret = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(cfg.issuer).setAudience("authenticated").setSubject("u").setExpirationTime("1h").sign(secret);
    expect(await verifyAccess(cfg, hs)).toBeNull();
  });
});
