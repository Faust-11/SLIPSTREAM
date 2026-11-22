import { describe, expect, it } from "vitest";
import { buildCsp } from "../../../next.config";

const CF = "https://challenges.cloudflare.com";

describe("CSP: Turnstile", () => {
  it("без ключа віджета політика не згадує Cloudflare", () => {
    expect(buildCsp({ dev: false, turnstile: false })).not.toContain("cloudflare");
  });
  it("з ключем Cloudflare дозволено в script-src, frame-src і connect-src — і більше ніде", () => {
    const parts = buildCsp({ dev: false, turnstile: true }).split("; ");
    const withCf = parts.filter((p) => p.includes(CF)).map((p) => p.split(" ")[0]);
    expect(withCf.sort()).toEqual(["connect-src", "frame-src", "script-src"]);
    expect(parts.find((p) => p.startsWith("frame-src"))).toContain("https://www.youtube-nocookie.com");
    expect(parts.find((p) => p.startsWith("connect-src"))).toContain("'self'");
  });
});
