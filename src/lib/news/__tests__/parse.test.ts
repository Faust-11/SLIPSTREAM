import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bskyPosts, clip, decodeEntities, isF1Text, jaccard, mergeHeadlines, parseF1Article, parseRss, plainText, previewUrl, safeUrl, type RssItem } from "../parse";

// Знімок джерел 14.11 (scripts/news/snapshot_fixtures.py).
const FX = path.resolve(__dirname, "../../../../e2e/fixtures/news");
const read = (f: string) => readFileSync(path.join(FX, f), "utf8");

describe("текст і посилання", () => {
  it("сутності: іменовані й числові; невідомі — як є", () => {
    expect(decodeEntities("Hamilton&#x27;s &amp; Russell&#8217;s &quot;fight&quot; &bogus;")).toBe("Hamilton's & Russell’s \"fight\" &bogus;");
  });
  it("простий текст: CDATA, теги (і закодовані теги), пробіли, обрізання з «…»", () => {
    expect(plainText("<![CDATA[<p>Hello <b>world</b></p>]]>")).toBe("Hello world");
    expect(plainText("&lt;p&gt;Encoded &lt;a href=x&gt;tag&lt;/a&gt;&lt;/p&gt;")).toBe("Encoded tag");
    expect(plainText("abcdefghij", 5)).toBe("abcd…");
    // Рев'ю PR #20: другий прохід не з'їдає текст між «<» і «>», а типографські сутності розкодовуються.
    expect(plainText("P1 &lt; P2 but &gt; expectations")).toBe("P1 < P2 but > expectations");
    expect(plainText("Norris&rsquo; win &ndash; and more&hellip;")).toBe("Norris’ win – and more…");
  });
  it("обрізання — за кодовими точками: емодзі не розрізається навпіл", () => {
    expect(clip("ab😀cd", 4)).toBe("ab😀…");
    expect(clip("ab😀cd", 3)).toBe("ab…");
    expect([...clip("😀😀😀", 2)]).toEqual(["😀", "…"]);
  });
  it("посилання — лише https на дозволений домен, без облікових даних", () => {
    const hosts = ["www.motorsport.com"];
    expect(safeUrl("https://www.motorsport.com/f1/news/x/1/", hosts)).toBe("https://www.motorsport.com/f1/news/x/1/");
    expect(safeUrl("http://www.motorsport.com/x", hosts)).toBeNull();
    expect(safeUrl("javascript:alert(1)", hosts)).toBeNull();
    expect(safeUrl("https://evil.example/www.motorsport.com", hosts)).toBeNull();
    expect(safeUrl("https://user:pw@www.motorsport.com/x", hosts)).toBeNull();
    expect(safeUrl("https://www.motorsport.com:8443/x", hosts)).toBeNull();
    expect(safeUrl("https://www.motorsport.com.evil.io/x", hosts)).toBeNull();
    expect(safeUrl("https://www.motorsport.com/f1/news/x/1/?utm_source=RSS&utm_medium=referral&id=7", hosts)).toBe("https://www.motorsport.com/f1/news/x/1/?id=7");
  });
  it("прев'ю: лише cdn-N.motorsport.com і media.formula1.com; Cloudinary — ширина 480", () => {
    expect(previewUrl("https://cdn-3.motorsport.com/images/x.jpg")).toBe("https://cdn-3.motorsport.com/images/x.jpg");
    expect(previewUrl("https://cdn.evil.com/x.jpg")).toBeNull();
    expect(previewUrl("https://media.formula1.com/image/upload/c_lfill,w_2048/q_auto/v1/a.webp")).toBe(
      "https://media.formula1.com/image/upload/c_lfill,w_480/q_auto/v1/a.webp",
    );
  });
});

describe("RSS (знімок 14.11)", () => {
  it("Motorsport і Autosport — по 50 записів, усі з датою й прев'ю; formula1.com — 10 без дати й прев'ю", () => {
    const ms = parseRss(read("rss-motorsport.xml"), "motorsport");
    const as = parseRss(read("rss-autosport.xml"), "autosport");
    const f1 = parseRss(read("rss-f1.xml"), "f1");
    expect([ms.length, as.length, f1.length]).toEqual([50, 50, 10]);
    expect([ms, as].flat().every((i) => i.publishedAt && i.image)).toBe(true);
    expect(f1.every((i) => i.publishedAt === null && i.image === null)).toBe(true);
    expect([...ms, ...as, ...f1].every((i) => i.link.startsWith("https://") && i.title && !/[<>]|&[a-z]+;/i.test(i.title + i.summary))).toBe(true);
  });
  it("стаття formula1.com: og:image і дата з JSON-LD; типова картинка «поділитися» — не прев'ю", () => {
    const html = `<meta property="og:image" content="https://media.formula1.com/image/upload/c_lfill,w_2048/q_auto/v1/x.webp"><script>{"datePublished":"2026-11-14T08:36:22.326Z"}</script>`;
    expect(parseF1Article(html)).toEqual({ image: "https://media.formula1.com/image/upload/c_lfill,w_480/q_auto/v1/x.webp", date: "2026-11-14T08:36:22.326Z" });
    expect(parseF1Article(`<meta property="og:image" content="https://www.formula1.com/etc/designs/fom-website/social/f1-default-share.jpg">`).image).toBeNull();
  });
});

describe("склейка дублів Motorsport/Autosport", () => {
  it("Жаккар: однакові слова — 1, різні — 0", () => {
    expect(jaccard("Imola GP off the table", "Imola GP off the table")).toBe(1);
    expect(jaccard("Norris wins", "Leclerc crashes")).toBe(0);
  });
  it("різні новини з шаблонними заголовками не склеюються; дублі за межами 48 год — теж", () => {
    const it = (title: string, link: string, publishedAt = "2026-11-14T10:00:00.000Z"): RssItem => ({ title, link, summary: "", publishedAt, image: null });
    const pairs: [string, string][] = [
      ["Verstappen wins Brazil GP", "Verstappen wins Las Vegas GP"],
      ["Norris on pole for Qatar GP sprint", "Piastri on pole for Qatar GP"],
      ["Hamilton penalised after Qatar GP", "Russell penalised after Qatar GP"],
    ];
    for (const [a, b] of pairs)
      expect(mergeHeadlines([{ source: "motorsport", item: it(a, "https://x/1") }, { source: "autosport", item: it(b, "https://x/2") }])).toHaveLength(2);
    const same = "FIA reveals latest ADUO results in final review of 2026 F1 season";
    expect(mergeHeadlines([{ source: "motorsport", item: it(same, "https://x/1") }, { source: "autosport", item: it(same, "https://x/2") }])).toHaveLength(1);
    expect(
      mergeHeadlines([
        { source: "motorsport", item: it(same, "https://x/1") },
        { source: "autosport", item: it(same, "https://x/2", "2026-11-10T10:00:00.000Z") },
      ]),
    ).toHaveLength(2);
  });

  it("знімок 14.11: дублі склеєно в «Також», кожне видання — не більше раза; новіші вгорі", () => {
    const items = (["motorsport", "autosport"] as const).flatMap((s) => parseRss(read(`rss-${s}.xml`), s).map((item) => ({ source: s, item })));
    const hl = mergeHeadlines(items);
    const merged = hl.filter((h) => h.also.length > 0);
    expect(merged.length).toBeGreaterThan(0);
    expect(hl.length + merged.reduce((s, h) => s + h.also.length, 0)).toBe(items.length);
    expect(merged.every((h) => h.also.every((a) => a.source !== h.source))).toBe(true);
    const dates = hl.map((h) => h.publishedAt!);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("Bluesky", () => {
  const feeds = JSON.parse(read("bsky.json")) as Record<string, Parameters<typeof bskyPosts>[0]>;

  it("фільтр F1: сильне слово — досить одного, слабких — два різних", () => {
    expect(isF1Text("Rain at Interlagos? No problem for Max.")).toBe(true);
    expect(isF1Text("Building up to lights out in Mexico!")).toBe(true);
    expect(isF1Text("Yamaha pulls out of Qatar MotoGP")).toBe(false);
    expect(isF1Text("The Baja 1000 is as close as you can get to the 1903 Paris-Madrid in 2026")).toBe(false);
    expect(isF1Text("Another championship finale closer to having unobstructed reading time on Sundays")).toBe(false);
    expect(isF1Text("Lovely dawn this morning.")).toBe(false);
    // Рев'ю PR #20: підрядки й неоднозначні слова поодинці — не F1.
    for (const t of [
      "New audio gear for the podcast studio",
      "Took a stroll by the river",
      "The constellation was stunning tonight",
      "Great day of alpine skiing",
      "The Williams sisters at Wimbledon",
      "Camaraderie in the press room",
      "Hamilton, Ontario gets snow",
    ])
      expect(isF1Text(t), t).toBe(false);
    expect(isF1Text("Russell on pole in Qatar")).toBe(true);
    expect(isF1Text("Audi confirm their F1 line-up")).toBe(true);
  });

  it("знімок 14.11: 11 акаунтів, без репостів і відповідей; про F1 ≈ 81 % власних", () => {
    const all = Object.values(feeds).map(bskyPosts);
    const own = all.reduce((s, r) => s + r.own, 0);
    const f1 = all.reduce((s, r) => s + r.posts.length, 0);
    expect(Object.keys(feeds)).toHaveLength(11);
    expect(own).toBe(278);
    expect(f1 / own).toBeGreaterThan(0.75);
    expect(f1 / own).toBeLessThan(0.9);
  });

  it("посилання — bsky.app з handle і rkey; мітка !no-unauthenticated — пост не показуємо", () => {
    const { posts } = bskyPosts(feeds["racefans.net"]!);
    expect(posts.every((p) => /^https:\/\/bsky\.app\/profile\/racefans\.net\/post\/[a-z0-9]+$/.test(p.url))).toBe(true);
    const hidden = {
      feed: [{ post: { uri: "at://did:plc:x/app.bsky.feed.post/abc", author: { handle: "x.bsky.social", labels: [{ val: "!no-unauthenticated" }] }, record: { text: "F1 news", createdAt: "2026-11-14T10:00:00Z" } } }],
    };
    expect(bskyPosts(hidden).posts).toEqual([]);
  });

  it("дата — раніша з createdAt і indexedAt: майбутній createdAt не закріплює пост угорі", () => {
    const f = (createdAt: string) => ({
      feed: [{ post: { uri: "at://did:plc:x/app.bsky.feed.post/abc", author: { handle: "x.bsky.social" }, record: { text: "F1 news", createdAt }, indexedAt: "2026-11-14T10:00:00.000Z" } }],
    });
    expect(bskyPosts(f("2030-01-01T00:00:00Z")).posts[0]?.createdAt).toBe("2026-11-14T10:00:00.000Z");
    expect(bskyPosts(f("2026-11-14T09:59:00Z")).posts[0]?.createdAt).toBe("2026-11-14T09:59:00.000Z");
  });
});
