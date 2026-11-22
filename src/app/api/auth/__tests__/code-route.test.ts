import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gotrue = vi.hoisted(() => ({ sendCode: vi.fn() }));
vi.mock("@/lib/play/gotrue", () => gotrue);

import { POST } from "../code/route";

const post = (body: unknown) =>
  new Request("https://outlap.test/api/auth/code", {
    method: "POST",
    headers: { origin: "https://outlap.test", host: "outlap.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://p.supabase.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "k");
  gotrue.sendCode.mockReset();
  gotrue.sendCode.mockResolvedValue({ ok: true, value: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/code — Turnstile", () => {
  it("без ключа віджета: токен не потрібен, у GoTrue іде null", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const res = await POST(post({ email: "a@b.co" }));
    expect(res.status).toBe(200);
    expect(gotrue.sendCode).toHaveBeenCalledWith(expect.anything(), "a@b.co", null);
  });

  it("з ключем, але без токена: 400 captcha_required, GoTrue не викликається", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x0000");
    for (const body of [{ email: "a@b.co" }, { email: "a@b.co", captchaToken: "" }, { email: "a@b.co", captchaToken: 5 }, { email: "a@b.co", captchaToken: "x".repeat(2049) }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "captcha_required" });
    }
    expect(gotrue.sendCode).not.toHaveBeenCalled();
  });

  it("з ключем і токеном: токен іде в GoTrue; captcha_failed → 400 captcha", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x0000");
    expect((await POST(post({ email: "a@b.co", captchaToken: "TOK" }))).status).toBe(200);
    expect(gotrue.sendCode).toHaveBeenCalledWith(expect.anything(), "a@b.co", "TOK");
    gotrue.sendCode.mockResolvedValue({ ok: false, reason: "captcha" });
    const res = await POST(post({ email: "a@b.co", captchaToken: "OLD" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "captcha" });
  });

  it("невірна адреса з токеном — як раніше (400 invalid_email), ліміт — 429", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x0000");
    expect((await (await POST(post({ email: "nope", captchaToken: "T" }))).json()).error).toBe("invalid_email");
    gotrue.sendCode.mockResolvedValue({ ok: false, reason: "rate_limited" });
    expect((await POST(post({ email: "a@b.co", captchaToken: "T" }))).status).toBe(429);
  });
});
