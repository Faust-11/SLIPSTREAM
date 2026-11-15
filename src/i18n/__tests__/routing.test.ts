import { describe, expect, it } from "vitest";
import { localeRewritePattern } from "../routing";

// next.config: { source: "/:path(<pattern>)", destination: "/en/:path" } — path-to-regexp бере шлях без першого «/».
const rewritten = (path: string) => new RegExp(`^/${localeRewritePattern()}$`).test(path);

describe("localeRewritePattern", () => {
  it("сторінки без префікса → /en", () => {
    for (const p of ["/teams", "/drivers/norris", "/ukraine", "/english", "/apidocs", "/de/teams", "/administrator", "/admins"]) {
      expect(rewritten(p), p).toBe(true);
    }
  });

  it("мовні префікси, службові й не-сторінкові маршрути — без rewrite", () => {
    for (const p of ["/uk", "/uk/teams", "/en", "/en/teams", "/_next/static/x.js", "/_vercel/insights", "/api", "/api/drivers/1", "/.well-known/security.txt", "/admin", "/admin/photos"]) {
      expect(rewritten(p), p).toBe(false);
    }
  });
});
