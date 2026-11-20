import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../.well-known/security.txt/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /.well-known/security.txt", () => {
  it("з SITE_CONTACT_EMAIL — 200, text/plain і адреса в Contact", async () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    vi.stubEnv("SITE_CONTACT_EMAIL", "hello@outlap.org");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("Contact: mailto:hello@outlap.org");
    expect(body).toContain("Canonical: https://outlap.org/.well-known/security.txt");
  });

  it("без SITE_CONTACT_EMAIL — 404, а не файл без Contact", () => {
    vi.stubEnv("SITE_CONTACT_EMAIL", "");
    expect(GET().status).toBe(404);
  });
});
