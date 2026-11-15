// @vitest-environment node
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { GOOGLE_ISSUER, parseAdminEnv, type AdminEnv } from "../env";
import { SESSION_TTL_S, signFlow, signSession, verifyFlow, verifySession } from "../token";

const BASE = {
  ADMIN_EMAILS: "Owner@Example.com, second@example.com",
  ADMIN_AUTH_SECRET: "x".repeat(32),
  ADMIN_GOOGLE_CLIENT_ID: "client",
  ADMIN_GOOGLE_CLIENT_SECRET: "secret",
};
const env = parseAdminEnv(BASE) as AdminEnv;

describe("parseAdminEnv — помилка конфігурації = адмінки немає", () => {
  it("повна конфігурація: Google, e-mail у нижньому регістрі", () => {
    expect(env.issuer.href).toBe(`${GOOGLE_ISSUER}/`);
    expect(env.insecureIssuer).toBe(false);
    expect([...env.admins]).toEqual(["owner@example.com", "second@example.com"]);
  });

  it.each([
    ["без адмінів", { ADMIN_EMAILS: " , не-email" }],
    ["короткий ключ", { ADMIN_AUTH_SECRET: "x".repeat(31) }],
    ["без client id", { ADMIN_GOOGLE_CLIENT_ID: "" }],
    ["без client secret", { ADMIN_GOOGLE_CLIENT_SECRET: undefined }],
    ["чужий провайдер", { ADMIN_OIDC_ISSUER: "https://evil.example" }],
    ["фейк на Vercel", { ADMIN_OIDC_ISSUER: "http://localhost:4455", VERCEL: "1" }],
    ["http не на localhost", { ADMIN_OIDC_ISSUER: "http://10.0.0.1:4455" }],
    ["зламана адреса", { ADMIN_OIDC_ISSUER: "::" }],
  ])("%s → null", (_, patch) => {
    expect(parseAdminEnv({ ...BASE, ...patch })).toBeNull();
  });

  it("фейковий провайдер для e2e — лише localhost і не на Vercel", () => {
    const local = parseAdminEnv({ ...BASE, ADMIN_OIDC_ISSUER: "http://127.0.0.1:4455" });
    expect(local?.insecureIssuer).toBe(true);
  });
});

describe("сесія", () => {
  const now = Date.UTC(2026, 10, 15, 12);

  it("власна сесія проходить; e-mail нормалізовано", async () => {
    const token = await signSession(env, "owner@example.com", now);
    expect(await verifySession(env, token, now + 1000)).toEqual({ email: "owner@example.com" });
  });

  it("після 12 год — недійсна", async () => {
    const token = await signSession(env, "owner@example.com", now);
    expect(await verifySession(env, token, now + (SESSION_TTL_S + 1) * 1000)).toBeNull();
  });

  it("e-mail прибрали зі списку — сесія більше не діє", async () => {
    const token = await signSession(env, "second@example.com", now);
    const narrowed = parseAdminEnv({ ...BASE, ADMIN_EMAILS: "owner@example.com" }) as AdminEnv;
    expect(await verifySession(narrowed, token, now)).toBeNull();
  });

  it("інший ключ, alg none, токен входу замість сесії, сміття — null", async () => {
    const other = parseAdminEnv({ ...BASE, ADMIN_AUTH_SECRET: "y".repeat(32) }) as AdminEnv;
    expect(await verifySession(env, await signSession(other, "owner@example.com", now), now)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ email: "owner@example.com", iss: "slipstream-admin", aud: "slipstream-admin/session" }),
    ).toString("base64url")}.`;
    expect(await verifySession(env, none, now)).toBeNull();
    const flow = await signFlow(env, { verifier: "v", state: "s", nonce: "n" }, now);
    expect(await verifySession(env, flow, now)).toBeNull();
    expect(await verifySession(env, "garbage", now)).toBeNull();
    expect(await verifySession(env, undefined, now)).toBeNull();
  });

  it("сесія без iat (maxTokenAge) — недійсна", async () => {
    const token = await new SignJWT({ email: "owner@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("slipstream-admin")
      .setAudience("slipstream-admin/session")
      .setExpirationTime(Math.floor(now / 1000) + 60)
      .sign(env.secret);
    expect(await verifySession(env, token, now)).toBeNull();
  });
});

describe("стан входу", () => {
  const now = Date.UTC(2026, 10, 15, 12);
  const flow = { verifier: "v".repeat(43), state: "s", nonce: "n" };

  it("туди й назад; через 10 хв — недійсний; сесія замість стану — null", async () => {
    const token = await signFlow(env, flow, now);
    expect(await verifyFlow(env, token, now + 60_000)).toEqual(flow);
    expect(await verifyFlow(env, token, now + 11 * 60_000)).toBeNull();
    expect(await verifyFlow(env, await signSession(env, "owner@example.com", now), now)).toBeNull();
  });
});
