import { describe, expect, it } from "vitest";
import nextConfig, { CANONICAL_ORIGIN, CANONICAL_REDIRECT_HOSTS } from "../../../next.config";

describe("редіректи на канонічний домен", () => {
  it("канонічний хост — outlap.org без www", () => {
    expect(CANONICAL_ORIGIN).toBe("https://outlap.org");
    expect(new URL(CANONICAL_ORIGIN).hostname.startsWith("www.")).toBe(false);
  });

  it("www і стара адреса Vercel → outlap.org тим самим шляхом, постійно (308)", async () => {
    const rules = await nextConfig.redirects!();
    for (const host of CANONICAL_REDIRECT_HOSTS) {
      const rule = rules.find((r) => r.has?.some((h) => h.type === "host" && h.value === host));
      expect(rule, host).toBeDefined();
      expect(rule).toMatchObject({ source: "/:path*", destination: "https://outlap.org/:path*", permanent: true });
    }
  });

  it("правила хостів ідуть першими: /en → / не має зловити їх раніше", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules.slice(0, CANONICAL_REDIRECT_HOSTS.length).every((r) => r.has?.[0]?.type === "host")).toBe(true);
  });

  it("сам outlap.org у переліку редіректів не фігурує (інакше петля)", () => {
    expect(CANONICAL_REDIRECT_HOSTS).not.toContain("outlap.org");
  });
});
