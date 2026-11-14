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
  it("відповів лише Motorsport.com: його 20 заголовків, решта — у failed; повтор після порожньої відповіді — з іншою адресою", async () => {
    const urls: string[] = [];
    const n = await load(async (u) => {
      if (u.includes("motorsport.com/rss")) {
        urls.push(u);
        return urls.length === 1 ? new Response("") : new Response(ms);
      }
      throw new Error("offline");
    });
    // Інша адреса = інший ключ кешу fetch: порожня 200 з кешу не повертається повтору (рев'ю PR #20).
    expect(urls).toHaveLength(2);
    expect(urls[1]).toMatch(/^https:\/\/www\.motorsport\.com\/rss\/f1\/news\/\?_r=\d+$/);
    expect(n.headlines).toHaveLength(20);
    expect(n.failed).toContain("Formula 1");
    expect(n.failed).toContain("Autosport");
    expect(n.failed.filter((f) => f.startsWith("@"))).toHaveLength(11);
  });

  it("завислий запит обривається за тайм-аутом навіть без реакції на signal (ISR відкидає signal)", async () => {
    vi.useFakeTimers();
    try {
      const pending = load((u) =>
        u.includes("autosport") ? new Promise<Response>(() => {}) : u.includes("motorsport.com/rss") ? Promise.resolve(new Response(ms)) : Promise.reject(new Error("offline")),
      );
      await vi.advanceTimersByTimeAsync(2 * 8000 + 100);
      const n = await pending;
      expect(n.failed).toContain("Autosport");
      expect(n.headlines).toHaveLength(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("статті formula1.com не відповіли: заголовки без дати — і позначка у failed", async () => {
    const f1 = readFileSync(path.join(FX, "rss-f1.xml"), "utf8");
    const n = await load(async (u) => {
      if (u.startsWith("https://www.formula1.com/en/latest/all.xml")) return new Response(f1);
      throw new Error("offline");
    });
    expect(n.headlines).toHaveLength(10);
    expect(n.headlines.every((h) => h.publishedAt === null)).toBe(true);
    expect(n.failed).toContain("Formula 1 (10/10)");
  });

  it("упали всі джерела: під час ISR — помилка, під час збірки — порожня стрічка", async () => {
    const down = async () => new Response("err", { status: 503 });
    await expect(load(down)).rejects.toThrow(/жодне джерело не відповіло/);
    const built = await load(down, "phase-production-build");
    expect([built.headlines, built.posts]).toEqual([[], []]);
  });
});
