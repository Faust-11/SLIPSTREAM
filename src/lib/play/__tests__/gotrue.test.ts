import { afterEach, describe, expect, it, vi } from "vitest";
import { playConfig } from "../config";
import { refreshSession, revokeSession, sendCode, verifyCode } from "../gotrue";

const cfg = playConfig({ SUPABASE_URL: "https://p.supabase.test/", SUPABASE_ANON_KEY: "sb_publishable_x" })!;
const reply = (status: number, body: unknown = {}) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
afterEach(() => vi.restoreAllMocks());

describe("playConfig", () => {
  it("без змінних — null; кінцевий / прибираємо; адреси JWKS та issuer", () => {
    expect(playConfig({})).toBeNull();
    expect(playConfig({ SUPABASE_URL: "https://p.supabase.test" })).toBeNull();
    expect(cfg).toMatchObject({ url: "https://p.supabase.test", issuer: "https://p.supabase.test/auth/v1", jwks: "https://p.supabase.test/auth/v1/.well-known/jwks.json" });
  });
});

describe("Supabase Auth REST", () => {
  it("sendCode: POST /otp з create_user і apikey, без Bearer", async () => {
    const spy = reply(200);
    expect(await sendCode(cfg, "a@b.co")).toEqual({ ok: true, value: true });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://p.supabase.test/auth/v1/otp");
    expect(JSON.parse(String(init!.body))).toEqual({ email: "a@b.co", create_user: true });
    const h = init!.headers as Record<string, string>;
    expect(h.apikey).toBe("sb_publishable_x");
    expect(h.authorization).toBeUndefined();
  });
  it("sendCode: 429 → rate_limited, 422 → invalid_email, 500 → unavailable, мережа → unavailable", async () => {
    reply(429);
    expect(await sendCode(cfg, "a@b.co")).toEqual({ ok: false, reason: "rate_limited" });
    reply(422);
    expect(await sendCode(cfg, "a@b.co")).toEqual({ ok: false, reason: "invalid_email" });
    reply(500);
    expect(await sendCode(cfg, "a@b.co")).toEqual({ ok: false, reason: "unavailable" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    expect(await sendCode(cfg, "a@b.co")).toEqual({ ok: false, reason: "unavailable" });
  });
  it("verifyCode: type=email; 403 otp_expired → invalid_code; успіх → сесія", async () => {
    const spy = reply(200, { access_token: "A", refresh_token: "R", expires_in: 3600, user: { email: "secret@b.co" } });
    const ok = await verifyCode(cfg, "a@b.co", "12345678");
    expect(ok).toEqual({ ok: true, value: { access_token: "A", refresh_token: "R", expires_in: 3600 } }); // користувач (пошта) не просочується
    expect(JSON.parse(String(spy.mock.calls[0]![1]!.body))).toEqual({ type: "email", email: "a@b.co", token: "12345678" });
    reply(403, { error_code: "otp_expired" });
    expect(await verifyCode(cfg, "a@b.co", "00000000")).toEqual({ ok: false, reason: "invalid_code" });
    reply(200, { nothing: true });
    expect(await verifyCode(cfg, "a@b.co", "12345678")).toEqual({ ok: false, reason: "unavailable" });
  });
  it("refresh: лише відповіді про сам refresh/сесію/користувача — сесії немає (bad_refresh); решта 4xx, 429, 5xx, мережа — збій", async () => {
    for (const code of ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "user_not_found"]) {
      reply(400, { error_code: code });
      expect(await refreshSession(cfg, "R"), code).toEqual({ ok: false, reason: "bad_refresh" });
    }
    reply(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found" }); // старий формат
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "bad_refresh" });
    reply(401, { message: "Invalid API key" }); // ключ ротовано / не задано — не відкликання сесії
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "unavailable" });
    reply(422, { error_code: "validation_failed" });
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "unavailable" });
    reply(400, {});
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "unavailable" });
    reply(429);
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "unavailable" });
    reply(502);
    expect(await refreshSession(cfg, "R")).toEqual({ ok: false, reason: "unavailable" });
  });
  it("logout: scope=local із Bearer; помилка мережі не кидає", async () => {
    const spy = reply(204);
    await revokeSession(cfg, "A");
    expect(spy.mock.calls[0]![0]).toBe("https://p.supabase.test/auth/v1/logout?scope=local");
    expect((spy.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe("Bearer A");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    await expect(revokeSession(cfg, "A")).resolves.toBeUndefined();
  });
});
