// Новини (фаза 4a, docs/plans/2026-11-14-phase4a-news.md): RSS трьох видань і пости F1-журналістів у Bluesky.
// Кожне джерело — тайм-аут і один повтор, помилка одного не валить інші; кеш fetch — 30 хв (ISR сторінки — теж).
// NEWS_FIXTURES=1 (CI, unit, e2e) — знімок e2e/fixtures/news замість мережі: прогони не залежать від чужих сайтів.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { bskyPosts, mergeHeadlines, parseF1Article, parseRss, type Headline, type Post, type RssItem, type SourceKey } from "@/lib/news/parse";

export type { Headline, Post, SourceKey } from "@/lib/news/parse";

export const NEWS_REVALIDATE = 1800;
const TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (compatible; SlipstreamBot/0.1; +https://slipstream-bice-eight.vercel.app)";
const FIXTURES = process.env.NEWS_FIXTURES === "1";
const FIXTURE_DIR = path.join(process.cwd(), "e2e", "fixtures", "news");
/** Час знімка фікстур (scripts/news/snapshot_fixtures.py, 14.11) — «Оновлено» в тестах стабільне. */
const FIXTURE_TIME = "2026-11-14T15:00:00.000Z";

export const RSS_SOURCES: { key: SourceKey; name: string; url: string; take: number }[] = [
  { key: "f1", name: "Formula 1", url: "https://www.formula1.com/en/latest/all.xml", take: 10 },
  { key: "motorsport", name: "Motorsport.com", url: "https://www.motorsport.com/rss/f1/news/", take: 20 },
  { key: "autosport", name: "Autosport", url: "https://www.autosport.com/rss/f1/news/", take: 20 },
];
export const BSKY_HANDLES = [
  "adamcooperf1.bsky.social", "andrewbensonf1.bsky.social", "chrismedlandf1.bsky.social", "danielmoxon.bsky.social",
  "elizablackstock.bsky.social", "joesaward.bsky.social", "keithcollantine.bsky.social", "peterdwindsor.bsky.social",
  "planetf1com.bsky.social", "racefans.net", "rorymitchellf1.bsky.social",
];
/** Постів у стрічці — найновіші. Макет мав 60; 40 — менше HTML і даних RSC (замір 14.11: 60 постів ≈ 36 КБ розмітки ×2). */
export const POSTS_MAX = 40;
/** Не більше постів одного автора: на знімку 14.11 racefans.net займав 17 з 40 (рев'ю PR #20). */
export const POSTS_PER_AUTHOR = 6;
/** Сторінки статей formula1.com (дата й прев'ю не змінюються) — кеш на добу, а не 10 × ~650 КБ кожні 30 хв. */
const ARTICLE_REVALIDATE = 86400;

export type NewsFeed = {
  fetchedAt: string;
  headlines: Headline[];
  posts: Post[];
  /** Склеєних дублів, власних постів і з них про F1 — для підписів банера. */
  stats: { merged: number; own: number; f1: number };
  /** Джерела, що не відповіли (у цьому зборі). */
  failed: string[];
};

/** Помилка тайм-ауту — окремий тип для тестів і повідомлень. */
class NewsTimeout extends Error {}

/**
 * Тайм-аут на весь запит разом із тілом — через Promise.race, а не лише AbortSignal: під час ISR запис кешу fetch завжди
 * застарілий (той самий revalidate), Next оновлює його на передньому плані й відкидає signal (patch-fetch.js:660–679;
 * замір рев'ю PR #20: тайм-аут 2 с, відповідь через 8 с без abort). Signal лишаємо — він діє під час збірки.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NewsTimeout(`тайм-аут ${ms} мс`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

async function fetchText(url: string, revalidate = NEWS_REVALIDATE): Promise<string> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    // Повтор — з іншим ключем кешу: порожня 200 потрапляє в кеш fetch, і повтор з тією самою адресою прочитав би її звідти
    // (patch-fetch.js:703; замір рев'ю PR #20). `cache: "no-store"` не можна — сторінка стала б динамічною (замір).
    const target = i === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}_r=${Date.now()}`;
    try {
      const text = await withTimeout(
        fetch(target, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate } }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
        TIMEOUT_MS,
      );
      // Замір 14.11: Bluesky раз віддав порожню відповідь з 200 — повторюємо.
      if (text.trim()) return text;
      throw new Error("порожня відповідь");
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`${url}: ${last instanceof Error ? last.message : String(last)}`);
}

const fixture = (file: string) => readFile(path.join(FIXTURE_DIR, file), "utf8");

/** Не більше n запитів одночасно (сторінки статей formula1.com ~650 КБ). */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

async function loadRss(src: (typeof RSS_SOURCES)[number], failed: string[]): Promise<RssItem[]> {
  const xml = FIXTURES ? await fixture(`rss-${src.key}.xml`) : await fetchText(src.url);
  const items = parseRss(xml, src.key, src.take);
  if (src.key !== "f1") return items;
  // formula1.com: дата й прев'ю — зі сторінки статті; стаття не відповіла — запис без них (не падаємо).
  const meta: Record<string, { image: string | null; date: string | null }> = FIXTURES ? JSON.parse(await fixture("f1-articles.json")) : {};
  const out = await pool(items, 4, async (it) => {
    let m = meta[it.link];
    if (!m && !FIXTURES) m = await fetchText(it.link, ARTICLE_REVALIDATE).then(parseF1Article, () => ({ image: null, date: null }));
    return { ...it, image: m?.image ?? null, publishedAt: m?.date ?? null };
  });
  // Без дати запис іде в кінець стрічки — видно в «не відповіли», а не мовчки (рев'ю PR #20).
  const undated = out.filter((x) => !x.publishedAt).length;
  if (undated > 0) failed.push(`${src.name} (${undated}/${out.length})`);
  return out;
}

async function loadBsky(handle: string) {
  const json = FIXTURES
    ? (JSON.parse(await fixture("bsky.json")) as Record<string, unknown>)[handle]
    : JSON.parse(await fetchText(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30&filter=posts_no_replies`));
  return bskyPosts((json ?? {}) as Parameters<typeof bskyPosts>[0]);
}

/**
 * Збір новин. Частина джерел упала — показуємо решту (failed). Упали всі: під час збірки — порожня стрічка (збірка не
 * падає), під час ISR — помилка, і Next лишає попередню версію сторінки замість порожньої.
 */
export const getNews = cache(async (): Promise<NewsFeed> => {
  const failed: string[] = [];
  const rss = await Promise.all(
    RSS_SOURCES.map((s) =>
      loadRss(s, failed).then(
        (items) => items.map((item) => ({ source: s.key, item })),
        () => (failed.push(s.name), []),
      ),
    ),
  );
  const bsky = await Promise.all(
    BSKY_HANDLES.map((h) =>
      loadBsky(h).catch(() => {
        failed.push(`@${h}`);
        return { posts: [] as Post[], own: 0 };
      }),
    ),
  );
  const flat = rss.flat();
  const headlines = mergeHeadlines(flat);
  const allPosts = bsky.flatMap((b) => b.posts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const perAuthor = new Map<string, number>();
  const posts = allPosts
    .filter((p) => {
      const k = (perAuthor.get(p.handle) ?? 0) + 1;
      perAuthor.set(p.handle, k);
      return k <= POSTS_PER_AUTHOR;
    })
    .slice(0, POSTS_MAX);
  if (headlines.length === 0 && posts.length === 0 && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Новини: жодне джерело не відповіло (${failed.join(", ")})`);
  }
  return {
    fetchedAt: FIXTURES ? FIXTURE_TIME : new Date().toISOString(),
    headlines,
    posts,
    stats: { merged: flat.length - headlines.length, own: bsky.reduce((s, b) => s + b.own, 0), f1: allPosts.length },
    failed,
  };
});
