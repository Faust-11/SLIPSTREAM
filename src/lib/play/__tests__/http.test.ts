import { describe, expect, it } from "vitest";
import { sameOrigin } from "../http";

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
