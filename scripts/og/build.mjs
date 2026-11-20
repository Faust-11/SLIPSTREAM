#!/usr/bin/env node
/**
 * Картинки прев'ю посилань (Open Graph) — JPEG 1200×630 у public/og/ + перелік src/data/og-images.json.
 *
 *   node scripts/og/build.mjs            # усе
 *   node scripts/og/build.mjs --only stories
 *   node scripts/og/build.mjs --only service    # лише «Про сайт» і «Джерела й ліцензії» (фаза 8)
 *
 * Чому JPEG і чому заздалегідь, а не next/og під час збірки:
 * - фото сайту — WebP, а Telegram (баг-трекер bugs.telegram.org/c/1021) і частина версій WhatsApp WebP у прев'ю
 *   не показують; JPEG показують усі. WhatsApp відкидає прев'ю важчі ~300 КБ — тримаємо менше (перевірка нижче);
 * - сторінок ~4 650: картинка на кожну додала б хвилини збірки й сотні МБ; тут — по одній на фото (сторінки гонок
 *   однієї траси ділять фото траси) і по картці на розділ × мову.
 *
 * Два види:
 * - section/<розділ>-<мова>.jpg — фірмова картка: назва розділу й опис зі словника;
 * - <seasons|circuits|stories>/<id>.jpg — фото героя сторінки з плашкою-логотипом Outlap (без тексту — одна на обидві мови).
 * Перелік читає src/lib/seo.ts: sections — «<розділ>-<мова>» → {src, alt}; photos — src фото сайту → JPEG.
 * Фото без JPEG (нове, ще не згенероване) отримує картку свого розділу.
 *
 * Шрифти — Google Fonts під час генерації (лише тут; сайт їх віддає сам через next/font). Запускати після нових фото.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const MANIFEST = join(ROOT, "src/data/og-images.json");
const MAX_BYTES = 300_000;
const W = 1200;
const H = 630;
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
// Логотип — вектор із public/brand (scripts/assets/logo_trace.py): версії для темного тла (картки темні).
const WORDMARK = readFileSync(join(ROOT, "public/brand/outlap-wordmark-for-dark.svg"), "utf8");
const LOGO_FULL = readFileSync(join(ROOT, "public/brand/outlap-logo-for-dark.svg"), "utf8");
const LOCALES = ["en", "uk"];
const SECTIONS = ["home", "seasons", "calendar", "news", "drivers", "teams", "circuits", "stories", "newbie", "game"];
// Службові сторінки (фаза 8) — не в меню: назва й опис з content/service/<мова>.json.
const SERVICE = ["about", "sources"];

const FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=Rubik+Mono+One&display=block&subset=cyrillic";

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const BASE_CSS = `
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: "IBM Plex Sans", sans-serif; background: #16181d; color: #f3f4f1; position: relative; }
  .brand { display: flex; align-items: center; }
  .brand svg { height: 92px; width: auto; display: block; }
  /* Бордюр (червоно-білий, як у роундела) — нижня смуга кожної картки. */
  .kerb { position: absolute; left: 0; right: 0; bottom: 0; height: 18px;
          background: repeating-linear-gradient(90deg, #e0301e 0 48px, #f3f4f1 48px 96px); }
`;

function sectionHtml(title, text, home = false) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${BASE_CSS}
  .wrap { position: absolute; inset: 0 0 18px 0; padding: 64px 72px; display: flex; flex-direction: column; }
  .bar { position: absolute; left: 0; top: 0; bottom: 18px; width: 22px; background: #ffc400; }
  h1 { margin-top: auto; font: 400 ${title.length > 24 ? 64 : title.length > 9 ? 92 : 112}px/1.02 "Rubik Mono One", sans-serif; color: #ffc400;
       letter-spacing: -0.01em; text-wrap: balance; }
  .big svg { height: 300px; width: auto; display: block; }
  p { margin-top: 28px; font-size: 36px; line-height: 1.3; color: #d5d8dd; max-width: 980px; text-wrap: pretty; }
  </style></head><body><div class="bar"></div><div class="wrap">
  ${home ? `<div class="big">${LOGO_FULL}</div>` : `<div class="brand">${WORDMARK}</div>`}
  ${home ? "" : `<h1>${esc(title)}</h1>`}<p${home ? ' style="margin-top:auto"' : ""}>${esc(text)}</p></div><div class="kerb"></div></body></html>`;
}

function photoHtml(dataUrl, focus) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${BASE_CSS}
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(22,24,29,.72) 100%); }
  .plate { position: absolute; left: 40px; bottom: 50px; padding: 14px 24px 14px 16px; background: #16181d; }
  .plate .brand svg { height: 64px; }
  </style></head><body><img src="${dataUrl}" alt=""><div class="shade"></div>
  <div class="plate"><div class="brand">${WORDMARK}</div></div><div class="kerb"></div></body></html>`;
}

/** Фото героїв: сезони й траси (curated), історії (story.json). focus — як object-position на сайті. */
function photoJobs() {
  const jobs = [];
  for (const [year, s] of Object.entries(json("src/data/curated/seasons.json").seasons)) {
    if (s?.hero) jobs.push({ kind: "seasons", id: year, src: s.hero.src, focus: `50% ${s.hero.focusY ?? 50}%` });
  }
  for (const [slug, c] of Object.entries(json("src/data/curated/circuits.json").places)) {
    if (c?.hero) jobs.push({ kind: "circuits", id: slug, src: c.hero.src, focus: `50% ${c.hero.focusY ?? 62}%` });
  }
  const dir = join(ROOT, "content/stories");
  for (const slug of readdirSync(dir)) {
    const p = join(dir, slug, "story.json");
    if (!existsSync(p)) continue;
    const story = JSON.parse(readFileSync(p, "utf8"));
    if (story.status === "draft") continue; // чернетки на сайт не виходять — картки для них не потрібні
    const hero = story.media?.find((m) => m.role === "hero");
    if (hero) jobs.push({ kind: "stories", id: slug, src: hero.src, focus: hero.focus ?? "50% 50%" });
  }
  return jobs;
}

async function shoot(page, html, file) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(join(file, ".."), { recursive: true });
  for (const quality of [84, 76, 68]) {
    await page.screenshot({ path: file, type: "jpeg", quality });
    if (statSync(file).size <= MAX_BYTES) return;
  }
  throw new Error(`${file}: ${statSync(file).size} Б > ${MAX_BYTES}`);
}

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const manifest = existsSync(MANIFEST) ? json("src/data/og-images.json") : { sections: {}, photos: {} };

if (!only || only === "sections") {
  for (const locale of LOCALES) {
    const d = json(`src/i18n/dictionaries/${locale}.json`);
    for (const s of SECTIONS) {
      const [title, text] = s === "home" ? ["OUTLAP", d.meta.home.description] : [d.nav[s], d.meta.sections[s]];
      const rel = `/og/section/${s}-${locale}.jpg`;
      await shoot(page, sectionHtml(title, text, s === "home"), join(ROOT, "public", rel));
      manifest.sections[`${s}-${locale}`] = { src: rel, alt: s === "home" ? `Outlap. ${text}` : `Outlap — ${title}. ${text}` };
    }
  }
}

// Окремі сторінки поза меню з власною карткою: /kyiv-time (текст — kyivPage.ogText).
if (!only || only === "sections" || only === "kyiv") {
  for (const locale of LOCALES) {
    const d = json(`src/i18n/dictionaries/${locale}.json`);
    const rel = `/og/section/kyiv-time-${locale}.jpg`;
    await shoot(page, sectionHtml(d.kyivPage.title, d.kyivPage.ogText), join(ROOT, "public", rel));
    manifest.sections[`kyiv-time-${locale}`] = { src: rel, alt: `Outlap — ${d.kyivPage.title}. ${d.kyivPage.ogText}` };
  }
}

if (!only || only === "sections" || only === "service") {
  for (const locale of LOCALES) {
    const c = json(`content/service/${locale}.json`);
    for (const s of SERVICE) {
      const { title, description: text } = c[s];
      const rel = `/og/section/${s}-${locale}.jpg`;
      await shoot(page, sectionHtml(title, text), join(ROOT, "public", rel));
      manifest.sections[`${s}-${locale}`] = { src: rel, alt: `Outlap — ${title}. ${text}` };
    }
  }
}

for (const job of photoJobs()) {
  if (only && (only === "service" || (only !== job.kind && only !== "photos"))) continue;
  const webp = readFileSync(join(ROOT, "public", job.src));
  const rel = `/og/${job.kind}/${job.id}.jpg`;
  await shoot(page, photoHtml(`data:image/webp;base64,${webp.toString("base64")}`, job.focus), join(ROOT, "public", rel));
  manifest.photos[job.src] = rel;
}

await browser.close();
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, JSON.stringify({ sections: sorted(manifest.sections), photos: sorted(manifest.photos) }, null, 2) + "\n");
console.log(`og: ${Object.keys(manifest.sections).length} карток розділів, ${Object.keys(manifest.photos).length} фото → public/og`);
