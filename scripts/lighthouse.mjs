#!/usr/bin/env node
/**
 * Lighthouse фази 1 (Task 8): мобільний профіль, медіана N прогонів.
 *
 * Пороги (рішення користувача 11.11, docs/decisions.md):
 * - accessibility, best-practices, seo ≥ 95;
 * - performance ≥ 90 і не нижче базового рівня порожньої сторінки Next мінус 3 бали
 *   (замір 11.11 на тому ж раннері: Next 16.4.5 з одним <h1> = 95, TBT ≈ 250 мс — стеля фреймворку);
 * - бюджети: LCP < 2500 мс, CLS < 0.1, TBT < 400 мс (медіани; порожня сторінка Next ≈ 250 + розкид ≈ 100).
 * Базовий рівень перемірювати після кожного оновлення Next (порожня сторінка тим самим скриптом).
 *
 * Троттлінг — `devtools` (рішення користувача 11.11): мережа й CPU сповільнюються по-справжньому з тими самими
 * параметрами мобільного 4G (mobileSlow4G: затримка, пропускна здатність, CPU ×4), а не моделюються (lantern).
 * Причина: на /teams симульований LCP 2,9 с при спостереженому 293 мс (фото малюється з першим кадром) —
 * модель, а не сторінка (docs/decisions.md). Повертаючи simulate, перемірювати базовий рівень.
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
const RUNS = Number(arg("runs", "5"));
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error(`--runs має бути цілим ≥ 1, отримано: ${arg("runs", "3")}`);
  process.exit(2);
}
const OUT = arg("out", "lighthouse-report");
const THRESHOLD = 95;
const FRAMEWORK_BASELINE = 95; // порожня сторінка Next 16.4.5, CI 11.11
const PERF_THRESHOLD = Math.max(90, FRAMEWORK_BASELINE - 3);
const BUDGET = { lcpMs: 2500, cls: 0.1, tbtMs: 400 };

// Сторінка команди (фаза 3b): McLaren — з банером і графіком, Ferrari — найбільша (250 перемог, 77 сезонів).
// По одній сторінці кожного типу (рішення користувача 14.11 — бюджет Actions: Lighthouse ≈ 850 з ~1 444 хв за 1–14.11).
// Прибрано дублі типу: /teams (є /uk/teams), /uk/teams/mclaren (є /teams/ferrari — EN), /seasons/1988 і /seasons/1988/15
// (є 2025 — сторінки того самого шаблону).
const PAGES = ["/", "/uk/teams", "/teams/ferrari", "/uk/drivers", "/uk/drivers/hamilton", "/uk/seasons", "/uk/seasons/2025", "/uk/seasons/2025/24", "/uk/circuits", "/circuits/yas-marina", "/uk/calendar", "/uk/news"];
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

// Збої запису трейсу Lighthouse (NO_NAVSTART тощо) — не оцінка сторінки: повторюємо прогін.
async function withRetry(fn, url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn(url);
    } catch (e) {
      if (i >= attempts) throw e;
      console.warn(`повтор ${i}/${attempts - 1}: ${e.message}`);
    }
  }
}

async function navigationRun(url) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const result = await lighthouse(url, { output: "json", logLevel: "error", throttlingMethod: "devtools" }, undefined, page);
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

const summary = {
  baseUrl: BASE_URL,
  runs: RUNS,
  throttling: "devtools",
  thresholds: { categories: THRESHOLD, performance: PERF_THRESHOLD, frameworkBaseline: FRAMEWORK_BASELINE, budget: BUDGET },
  pages: [],
  ok: true,
};
await mkdir(OUT, { recursive: true });

for (const path of PAGES) {
  const url = new URL(path, BASE_URL).href;
  const lhrs = [];
  for (let i = 0; i < RUNS; i++) lhrs.push(await withRetry(navigationRun, url));
  const categories = Object.fromEntries(
    Object.keys(lhrs[0].categories).map((c) => [c, median(lhrs.map((l) => pct(l.categories[c].score)))]),
  );
  const metrics = {
    lcpMs: median(lhrs.map((l) => Math.round(l.audits["largest-contentful-paint"].numericValue))),
    cls: median(lhrs.map((l) => l.audits["cumulative-layout-shift"].numericValue)),
    tbtMs: median(lhrs.map((l) => Math.round(l.audits["total-blocking-time"].numericValue))),
    benchmarkIndex: median(lhrs.map((l) => l.environment.benchmarkIndex)),
  };
  // agentic-browsing — довідково (дріб, не 0–100).
  const below = ["accessibility", "best-practices", "seo"].filter((c) => categories[c] !== undefined && categories[c] < THRESHOLD);
  if (categories.performance < PERF_THRESHOLD) below.push(`performance < ${PERF_THRESHOLD}`);
  if (metrics.lcpMs >= BUDGET.lcpMs) below.push(`LCP ≥ ${BUDGET.lcpMs}`);
  if (metrics.cls >= BUDGET.cls) below.push(`CLS ≥ ${BUDGET.cls}`);
  if (metrics.tbtMs >= BUDGET.tbtMs) below.push(`TBT ≥ ${BUDGET.tbtMs}`);
  const pass = below.length === 0;
  summary.ok &&= pass;
  // Провали й звіт — з прогону з медіанним performance (не з першого, можливо викидного).
  const medianRun = lhrs.find((l) => pct(l.categories.performance.score) === categories.performance) ?? lhrs[0];
  summary.pages.push({ path, mode: "navigation", categories, metrics, below, failing: failingAudits(medianRun), pass });
  await writeFile(join(OUT, `${path === "/" ? "_root" : path.replaceAll("/", "_")}.json`), JSON.stringify(medianRun, null, 1));
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
  if (p.below?.length) console.log(`    нижче порогу: ${p.below.join(", ")}`);
  if (p.failing.length) console.log(`    аудити < 0.9: ${p.failing.join(", ")}`);
}
process.exit(summary.ok ? 0 : 1);
