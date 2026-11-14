import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Мережевий режим (без NEWS_FIXTURES): fetch підмінено. Частина джерел упала — решта показується; упали всі — під час
// ISR помилка (Next лишає попередню сторінку), під час збірки — порожня стрічка (збірка не падає).
vi.mock("server-only", () => ({}));
const FX = path.resolve(__dirname, "../../../../e2e/fixtures/news");
const ms = readFileSync(path.join(FX, "rss-motorsport.xml"), "utf8");

async function load(fetchImpl: (url: string) => Promise<Response>, phase?: string) {
  vi.resetModules();
  vi.stubEnv("NEWS_FIXTURES", "");
  vi.stubEnv("NEXT_PHASE", phase ?? "");
  vi.stubGlobal("fetch", vi.fn((u: string) => fetchImpl(String(u))));
  return (await import("../news")).getNews();
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getNews — збої джерел", () => {
  it("відповів лише Motorsport.com: його 20 заголовків, решта — у failed; повтор після порожньої відповіді", async () => {
    let calls = 0;
    const n = await load(async (u) => {
      if (u.includes("motorsport.com/rss")) return ++calls === 1 ? new Response("") : new Response(ms);
      throw new Error("offline");
    });
    expect(calls).toBe(2);
    expect(n.headlines).toHaveLength(20);
    expect(n.failed).toContain("Formula 1");
    expect(n.failed).toContain("Autosport");
    expect(n.failed.filter((f) => f.startsWith("@"))).toHaveLength(11);
  });

  it("упали всі джерела: під час ISR — помилка, під час збірки — порожня стрічка", async () => {
    const down = async () => new Response("err", { status: 503 });
    await expect(load(down)).rejects.toThrow(/жодне джерело не відповіло/);
    const built = await load(down, "phase-production-build");
    expect([built.headlines, built.posts]).toEqual([[], []]);
  });
});
