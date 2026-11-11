#!/usr/bin/env node
/**
 * Lighthouse фази 1 (Task 8): мобільний профіль, медіана N прогонів, пороги з плану (≥ 95 у кожній категорії).
 *
 *   BASE_URL=http://localhost:3100 CHROME_PATH=… node scripts/lighthouse.mjs [--runs 3] [--out lighthouse-report]
 *
 * - Сторінки 200 — режим navigation (усі категорії, зокрема performance).
 * - 404 — режим snapshot: navigation на відповідь 404 Lighthouse не запускає («Status code: 404»);
 *   у snapshot performance немає, а аудит http-status-code для 404 падає за визначенням — його не рахуємо.
 * - SEO вимірюється на збірці з SITE_INDEXING=on: до запуску сайт навмисно noindex (аудит is-crawlable).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lighthouse, { startFlow } from "lighthouse";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const CHROME_PATH = process.env.CHROME_PATH;
const RUNS = Number(arg("runs", "3"));
const OUT = arg("out", "lighthouse-report");
const THRESHOLD = 95;

const PAGES = ["/", "/uk/teams"];
const NOT_FOUND = "/uk/nope";
// Для 404 за визначенням: статус 404 (SEO) — не вада сторінки.
const IGNORED_ON_404 = new Set(["http-status-code"]);

if (!CHROME_PATH) {
  console.error("Потрібен CHROME_PATH (шлях до Chrome/Chromium).");
  process.exit(2);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (score) => (score === null ? null : Math.round(score * 100));

function failingAudits(lhr, ignored = new Set()) {
  const out = [];
  for (const [cat, category] of Object.entries(lhr.categories)) {
    for (const ref of category.auditRefs) {
      const audit = lhr.audits[ref.id];
      if (ref.weight > 0 && audit.score !== null && audit.score < 0.9 && !ignored.has(ref.id)) {
        out.push(`${cat}:${ref.id} (${audit.score})`);
      }
    }
  }
  return out;
}

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    // LH_NO_SANDBOX=1 — лише на CI: Ubuntu 23.10+ (AppArmor) не дає Chromium sandbox («No usable sandbox»);
    // одноразовий раннер і лише наш localhost (так само Playwright за замовчуванням).
    args: ["--no-first-run", "--no-default-browser-check", ...(process.env.LH_NO_SANDBOX === "1" ? ["--no-sandbox"] : [])],
  });
}

async function navigationRun(url) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const result = await lighthouse(url, { output: "json", logLevel: "error" }, undefined, page);
    if (!result || result.lhr.runtimeError) throw new Error(`${url}: ${result?.lhr.runtimeError?.message ?? "немає результату"}`);
    return result.lhr;
  } finally {
    await browser.close();
  }
}

async function snapshotRun(url) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    const flow = await startFlow(page, { config: { extends: "lighthouse:default", settings: { formFactor: "mobile" } } });
    await page.goto(url, { waitUntil: "networkidle0" });
    await flow.snapshot();
    const [step] = (await flow.createFlowResult()).steps;
    return step.lhr;
  } finally {
    await browser.close();
  }
}

const summary = { baseUrl: BASE_URL, runs: RUNS, threshold: THRESHOLD, pages: [], ok: true };
await mkdir(OUT, { recursive: true });

for (const path of PAGES) {
  const url = new URL(path, BASE_URL).href;
  const lhrs = [];
  for (let i = 0; i < RUNS; i++) lhrs.push(await navigationRun(url));
  const categories = Object.fromEntries(
    Object.keys(lhrs[0].categories).map((c) => [c, median(lhrs.map((l) => pct(l.categories[c].score)))]),
  );
  const metrics = {
    lcpMs: median(lhrs.map((l) => Math.round(l.audits["largest-contentful-paint"].numericValue))),
    cls: median(lhrs.map((l) => l.audits["cumulative-layout-shift"].numericValue)),
    tbtMs: median(lhrs.map((l) => Math.round(l.audits["total-blocking-time"].numericValue))),
    benchmarkIndex: median(lhrs.map((l) => l.environment.benchmarkIndex)),
  };
  // Порогові категорії плану; agentic-browsing — довідково (дріб, не 0–100).
  const gated = ["performance", "accessibility", "best-practices", "seo"];
  const below = gated.filter((c) => categories[c] !== undefined && categories[c] < THRESHOLD);
  const pass = below.length === 0 && metrics.cls < 0.1;
  summary.ok &&= pass;
  summary.pages.push({ path, mode: "navigation", categories, metrics, failing: failingAudits(lhrs[0]), pass });
  await writeFile(join(OUT, `${path === "/" ? "_root" : path.replaceAll("/", "_")}.json`), JSON.stringify(lhrs[0], null, 1));
}

{
  const url = new URL(NOT_FOUND, BASE_URL).href;
  const lhr = await snapshotRun(url);
  // У snapshot категорія performance неповна (без метрик завантаження) — не показуємо й не рахуємо.
  const categories = Object.fromEntries(
    Object.entries(lhr.categories)
      .filter(([c]) => c !== "performance")
      .map(([c, v]) => [c, pct(v.score)]),
  );
  const failing = failingAudits(lhr, IGNORED_ON_404).filter((f) => !f.startsWith("performance:"));
  // SEO 404 знижує лише http-status-code; перевіряємо, що інших провалів у SEO немає.
  const below = ["accessibility", "best-practices"].filter((c) => categories[c] < THRESHOLD);
  const pass = below.length === 0 && !failing.some((f) => f.startsWith("seo:"));
  summary.ok &&= pass;
  summary.pages.push({ path: NOT_FOUND, mode: "snapshot", categories, failing, ignored: [...IGNORED_ON_404], pass });
  await writeFile(join(OUT, "_404.json"), JSON.stringify(lhr, null, 1));
}

await writeFile(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const p of summary.pages) {
  console.log(
    `${p.pass ? "✓" : "✗"} ${p.path} [${p.mode}] ${Object.entries(p.categories)
      .map(([c, v]) => `${c}=${v}`)
      .join(" ")}${p.metrics ? ` | LCP ${p.metrics.lcpMs} ms, CLS ${p.metrics.cls.toFixed(3)}, TBT ${p.metrics.tbtMs} ms, BI ${p.metrics.benchmarkIndex}` : ""}`,
  );
  if (p.failing.length) console.log(`    провали: ${p.failing.join(", ")}`);
}
process.exit(summary.ok ? 0 : 1);
