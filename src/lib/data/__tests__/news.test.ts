import { describe, expect, it, vi } from "vitest";

// Знімок 14.11 замість мережі (той самий режим, що в CI й e2e).
vi.stubEnv("NEWS_FIXTURES", "1");
vi.mock("server-only", () => ({}));

describe("getNews — знімок 14.11", () => {
  it("заголовки трьох видань (10 + 20 + 20, дублі склеєно), новіші вгорі; formula1.com — з датою й прев'ю зі сторінки статті", async () => {
    const { getNews } = await import("../news");
    const n = await getNews();
    expect(n.failed).toEqual([]);
    expect(n.fetchedAt).toBe("2026-11-14T15:00:00.000Z");
    expect(n.headlines.length + n.stats.merged).toBe(50);
    expect(new Set(n.headlines.map((h) => h.source))).toEqual(new Set(["f1", "motorsport", "autosport"]));
    const f1 = n.headlines.filter((h) => h.source === "f1");
    expect(f1.length).toBe(10);
    expect(f1.filter((h) => h.publishedAt && h.image?.startsWith("https://media.formula1.com/")).length).toBeGreaterThanOrEqual(9);
    const dated = n.headlines.filter((h) => h.publishedAt).map((h) => h.publishedAt!);
    expect(dated).toEqual([...dated].sort().reverse());
  });

  it("пости: не більше 60, новіші вгорі, усі про F1 і з посиланням bsky.app", async () => {
    const { getNews, POSTS_MAX } = await import("../news");
    const n = await getNews();
    expect(n.posts.length).toBe(Math.min(POSTS_MAX, n.stats.f1));
    expect(n.stats.own).toBe(278);
    expect(n.posts.every((p) => p.url.startsWith("https://bsky.app/profile/"))).toBe(true);
    const t = n.posts.map((p) => p.createdAt);
    expect(t).toEqual([...t].sort().reverse());
  });
});
