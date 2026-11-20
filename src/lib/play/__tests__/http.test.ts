import { describe, expect, it } from "vitest";
import { readJson, sameOrigin } from "../http";

const req = (headers: Record<string, string>) => new Request("https://outlap.org/api/auth/code", { method: "POST", headers });

describe("sameOrigin — Origin проти хоста запиту", () => {
  it("збігається з Host; працює для будь-якого псевдоніма сайту", () => {
    expect(sameOrigin(req({ origin: "https://outlap.org", host: "outlap.org" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://www.outlap.org", host: "www.outlap.org" }))).toBe(true);
    expect(sameOrigin(req({ origin: "http://localhost:3100", host: "localhost:3100" }))).toBe(true);
  });
  it("x-forwarded-host має перевагу (проксі)", () => {
    expect(sameOrigin(req({ origin: "https://outlap.org", host: "internal:3000", "x-forwarded-host": "outlap.org" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://outlap.org", host: "outlap.org", "x-forwarded-host": "evil.test" }))).toBe(false);
  });
  it("чужий, відсутній і некоректний Origin — відмова", () => {
    expect(sameOrigin(req({ origin: "https://evil.test", host: "outlap.org" }))).toBe(false);
    expect(sameOrigin(req({ origin: "https://outlap.org.evil.test", host: "outlap.org" }))).toBe(false);
    expect(sameOrigin(req({ origin: "null", host: "outlap.org" }))).toBe(false);
    expect(sameOrigin(req({ origin: "not a url", host: "outlap.org" }))).toBe(false);
    expect(sameOrigin(req({ host: "outlap.org" }))).toBe(false);
    expect(sameOrigin(req({ origin: "ftp://outlap.org", host: "outlap.org" }))).toBe(false);
  });
});

describe("readJson — ліміт у БАЙТАХ, а не в одиницях UTF-16 (/code-review high)", () => {
  const post = (body: string) => new Request("https://outlap.org/api/auth/nick", { method: "POST", body });
  it("кирилиця: 1100 літер = 2200 байт > 2048 — відмова (за довжиною рядка проходило б)", async () => {
    const body = JSON.stringify({ nick: "я".repeat(1100) });
    expect(body.length).toBeLessThanOrEqual(2048);
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(2048);
    expect(await readJson(post(body))).toBeNull();
  });
  it("у межах ліміту — розбирається; ASCII на межі проходить", async () => {
    expect(await readJson(post(JSON.stringify({ nick: "Макс" })))).toEqual({ nick: "Макс" });
    const edge = JSON.stringify({ a: "x".repeat(2048 - 8) });
    expect(new TextEncoder().encode(edge).length).toBe(2048);
    expect(await readJson(post(edge))).toEqual({ a: "x".repeat(2048 - 8) });
  });
});
