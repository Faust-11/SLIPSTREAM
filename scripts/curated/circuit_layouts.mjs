#!/usr/bin/env node
// Схеми трас (фаза 3h, docs/plans/2026-11-13-phase3h-circuits.md, рішення користувача 13.11 №1) → src/data/curated/circuit-layouts.json.
//
//   node scripts/curated/circuit_layouts.mjs [--cache DIR] [--review FILE.html]
//
// Джерела:
// 1. f1-circuits (Tomislav Bacinger, MIT; дані © учасники OpenStreetMap, ODbL) — GeoJSON нинішньої конфігурації, коміт
//    закріплено (SHA нижче). Зіставлення з трасою Jolpica — ЗА КООРДИНАТАМИ (центр лінії ↔ координати траси ≤ 3 км;
//    замір 13.11: 40 з 40, максимум 1,3 км; за назвами зіставлення давало хибні пари — Монца → Яс-Марина).
// 2. Wikimedia Commons — SVG для трас, яких немає у f1-circuits (перелік COMMONS: файл з інфобоксу статті enwiki або P15
//    Вікіданих, кожен переглянуто; ліцензія й автор — з Commons, лише вільні). Береться найдовший контур (path/polyline/
//    polygon/line) у координатах екрана — браузер сам застосовує всі transform. SVG перед завантаженням очищено від
//    <script>, on*-атрибутів і зовнішніх посилань; мережу в браузері вимкнено.
// Результат: шлях у власному viewBox (довша сторона 1000), північ угорі для f1-circuits; спрощення Дугласа — Пекера.
// Браузер: Chromium Playwright або системний Chrome (PLAYWRIGHT_CHANNEL=chrome, як для e2e на macOS 12).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { SIDE, toLayout, toPageLayout } from "./layout-geometry.mjs";

const REPO = new URL("../../", import.meta.url).pathname;
const OUT = join(REPO, "src/data/curated/circuit-layouts.json");
// Файли для маски на картках списку (CSS mask-image; колір дає сторінка — var(--ink)).
const SVG_DIR = join(REPO, "public/img/circuits/layouts");
const PLACES = join(REPO, "src/data/curated/circuits.json");
const SHA = "8094e957b8d6aa8b9f4510c93968556cccd30e02"; // bacinger/f1-circuits, 16.10.2026
const GEOJSON = `https://raw.githubusercontent.com/bacinger/f1-circuits/${SHA}/f1-circuits.geojson`;
const JOLPICA = "https://api.jolpi.ca/ergast/f1/circuits.json?limit=100";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "Slipstream-data-loader/0.2 (non-commercial F1 fan site; batched, cached)";
const MAX_KM = 3;
const FREE = ["CC0", "Public domain", "PD", "CC BY", "CC BY-SA", "Attribution", "GFDL", "FAL", "Copyrighted free use"];

/** Траса Jolpica → файл Commons (перегляд 13.11; причини відмови — у docs/data/review-2026-11-13-circuit-layouts.md). */
const COMMONS = {
  "ain-diab": "Ain-Diab.svg",
  aintree: "Circuit Aintree.svg",
  avus: "Circuit AVUS.svg",
  brands_hatch: "Brands Hatch 2003.svg",
  bremgarten: "Circuit Bremgarten.svg",
  buddh: "Buddh Circuit 1.svg",
  dijon: "Dijon-Prenois Circuit.svg",
  essarts: "Rouen-Les-Essarts.svg",
  fuji: "Fuji.svg",
  george: "Prince George Circuit.svg",
  jarama: "Circuito Permanente del Jarama.svg",
  jerez: "Circuito de Jerez v2.svg",
  mosport: "Mosport-CTMP.svg",
  phoenix: "Phoenix Grand Prix Route - 1991.svg",
  sebring: "Sebring International Raceway.svg",
  valencia: "Circuit Valensia street.svg",
  yeongam: "Korea international circuit v3.svg",
  zeltweg: "Circuit Zeltweg.svg",
  zolder: "Zolder.svg",
};

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const CACHE = arg("--cache");

async function fetchCached(url, kind = "json") {
  const key = CACHE && join(CACHE, createHash("sha1").update(url).digest("hex") + (kind === "json" ? ".json" : ".txt"));
  if (key) {
    try {
      const s = await readFile(key, "utf8");
      return kind === "json" ? JSON.parse(s) : s;
    } catch {}
  }
  // Wikimedia жорстко обмежує частоту (граблі проєкту №4): пауза перед кожним запитом без кешу, 429 — повтор із наростанням.
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(120, Number(res.headers.get("retry-after") ?? 5 * 2 ** attempt));
      console.error(`  429, повтор через ${wait} с: ${url.slice(0, 90)}`);
      await new Promise((r) => setTimeout(r, 1000 * wait));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    console.error(`  ↓ ${url.slice(0, 100)}`);
    const s = await res.text();
    if (key) {
      await mkdir(CACHE, { recursive: true });
      await writeFile(key, s);
    }
    return kind === "json" ? JSON.parse(s) : s;
  }
}

function km([lat1, lng1], [lat2, lng2]) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function geoPoints(geometry) {
  const lines = geometry.type === "MultiLineString" ? geometry.coordinates : [geometry.coordinates];
  const all = lines.flat();
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const c = Math.cos((lat0 * Math.PI) / 180);
  // Найдовша лінія (у f1-circuits — одна лінія на трасу); північ угорі: y = −широта.
  const line = lines.reduce((a, b) => (b.length > a.length ? b : a));
  return { pts: line.map(([lng, lat]) => [lng * c, -lat]), center: [lat0, all.reduce((s, p) => s + p[0], 0) / all.length] };
}

/** Очищення SVG з Commons перед завантаженням у браузер. */
function sanitize(svg) {
  return svg
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
}

async function svgPoints(page, svg) {
  // Окремий SVG-документ (data: URL), не вставка в HTML: корінь з префіксом простору імен (<svg:svg>) HTML-парсер не розпізнає.
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(sanitize(svg)).toString("base64")}`);
  return page.evaluate(() => {
    const root = document.documentElement;
    if (!root || root.localName !== "svg") return null;
    if (!root.getAttribute("width")) root.setAttribute("width", "1000");
    const NS = "http://www.w3.org/2000/svg";
    const els = ["path", "polyline", "polygon", "line"].flatMap((t) => [...root.getElementsByTagNameNS(NS, t)])
      .filter((e) => !e.closest("defs, clipPath, mask, marker, pattern, symbol"));
    let best = null;
    for (const el of els) {
      const n = el.getTotalLength();
      if (!(n > 0)) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const pts = [];
      const steps = 1500;
      for (let i = 0; i <= steps; i++) {
        const p = el.getPointAtLength((n * i) / steps);
        const q = new DOMPoint(p.x, p.y).matrixTransform(m);
        pts.push([q.x, q.y]);
      }
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (!best || len > best.len) best = { len, pts, tag: el.tagName, id: el.id || null, total: els.length };
    }
    return best;
  });
}

async function commonsInfo(files) {
  const out = {};
  for (let i = 0; i < files.length; i += 40) {
    const q = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|mime|extmetadata",
      titles: files.slice(i, i + 40).map((f) => `File:${f}`).join("|"),
    });
    const d = await fetchCached(`${COMMONS_API}?${q}`);
    const norm = Object.fromEntries((d.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of d.query.pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const md = ii.extmetadata ?? {};
      const strip = (s) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      out[(norm[p.title] ?? p.title).slice(5)] = {
        url: ii.url, mime: ii.mime, page: ii.descriptionurl,
        license: strip(md.LicenseShortName?.value), author: strip(md.Artist?.value) || "unknown",
      };
    }
  }
  return out;
}

const isFree = (lic) => FREE.some((f) => lic === f || lic.startsWith(f + " ")) && !/\bNC\b|\bND\b/.test(lic);

async function main() {
  const places = JSON.parse(await readFile(PLACES, "utf8")).places;
  const jc = (await fetchCached(JOLPICA)).MRData.CircuitTable.Circuits;
  const geo = await fetchCached(GEOJSON);
  const layouts = {};
  const report = [];

  for (const f of geo.features) {
    const { pts, center } = geoPoints(f.geometry);
    let best = null;
    for (const c of jc) {
      const d = km(center, [Number(c.Location.lat), Number(c.Location.long)]);
      if (!best || d < best.d) best = { d, ref: c.circuitId };
    }
    if (best.d > MAX_KM || !places[best.ref]) {
      report.push(`f1-circuits ${f.properties.id}: без траси Jolpica (${best.ref}, ${best.d.toFixed(1)} км)`);
      continue;
    }
    if (layouts[best.ref]) throw new Error(`дві схеми f1-circuits для ${best.ref}`);
    layouts[best.ref] = { ...toLayout(pts), page: toPageLayout(pts), source: "f1-circuits", file: f.properties.id, km: Number(best.d.toFixed(1)) };
  }

  const files = Object.values(COMMONS);
  console.error(`f1-circuits: ${Object.keys(layouts).length} схем; Commons: ${files.length} файлів`);
  const info = await commonsInfo(files);
  console.error(`Commons imageinfo: ${Object.keys(info).length}`);
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  // JavaScript сторінки вимкнено: скрипти з SVG не виконуються взагалі, зокрема з префіксом простору імен (<svg:script>),
  // які регулярний вираз sanitize() не ловить (рев'ю 13.11); page.evaluate працює й так (через DevTools-протокол).
  const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
  await ctx.route("**/*", (r) => (r.request().url().startsWith("data:") || r.request().url() === "about:blank" ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  for (const [ref, file] of Object.entries(COMMONS)) {
    console.error(`· ${ref}: ${file}`);
    if (layouts[ref]) throw new Error(`${ref}: уже є схема f1-circuits`);
    const ci = info[file];
    if (!ci) throw new Error(`${ref}: немає файлу Commons «${file}»`);
    if (ci.mime !== "image/svg+xml") throw new Error(`${ref}: «${file}» не SVG (${ci.mime})`);
    if (!isFree(ci.license)) throw new Error(`${ref}: «${file}» — невільна ліцензія ${ci.license}`);
    let svg;
    try {
      svg = await fetchCached(ci.url, "text");
    } catch (e) {
      // Ліміт Wikimedia (429) не має зривати весь прогін: траса лишається без схеми до наступного запуску.
      report.push(`commons ${ref}: «${file}» не завантажено (${e.message.slice(0, 60)}) — запустити ще раз`);
      continue;
    }
    const got = await svgPoints(page, svg);
    if (!got) {
      report.push(`commons ${ref}: у «${file}» не знайдено контуру — пропущено`);
      continue;
    }
    layouts[ref] = {
      ...toLayout(got.pts), page: toPageLayout(got.pts), source: "commons", file,
      credit: { page: ci.page, author: ci.author, license: ci.license },
      element: `${got.tag}${got.id ? "#" + got.id : ""} з ${got.total}`,
    };
  }
  await browser.close();

  const sorted = Object.fromEntries(Object.keys(layouts).sort().map((k) => [k, layouts[k]]));
  const missing = Object.keys(places).filter((k) => !layouts[k]).sort();
  const json = {
    _about:
      "Схеми трас: шлях у viewBox 0 0 w h (довша сторона 1000). source = f1-circuits — нинішня конфігурація, " +
      `bacinger/f1-circuits@${SHA.slice(0, 7)} (MIT; дані © учасники OpenStreetMap, ODbL), північ угорі; ` +
      "source = commons — файл Wikimedia Commons (автор і ліцензія — credit). page — схема для сторінки траси: детальніша, " +
      "повернута на rot° під горизонтальну рамку 1,7:1. " +
      "Генератор: scripts/curated/circuit_layouts.mjs; " +
      "перегляд схем — docs/data/review-2026-11-13-circuit-layouts.md.",
    layouts: Object.fromEntries(
      Object.entries(sorted).map(([k, v]) => {
        const page = { d: v.page.d, w: v.page.w, h: v.page.h, rot: v.page.rot };
        return [k, { d: v.d, w: v.w, h: v.h, page, source: v.source, ...(v.credit ? { credit: v.credit } : {}) }];
      }),
    ),
  };
  await writeFile(OUT, JSON.stringify(json, null, 1) + "\n");
  await mkdir(SVG_DIR, { recursive: true });
  for (const [k, v] of Object.entries(sorted)) {
    // Поля 4 % і товщина 3,2 % довшої сторони: на картці ~280 px — лінія ~3 px, як у макеті.
    const pad = Math.round(SIDE * 0.04);
    await writeFile(
      join(SVG_DIR, `${k}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${v.w + 2 * pad} ${v.h + 2 * pad}"><path d="${v.d}" fill="none" stroke="#000" stroke-width="${Math.round(SIDE * 0.032)}" stroke-linejoin="round" stroke-linecap="round"/></svg>\n`,
    );
  }
  const size = Buffer.byteLength(JSON.stringify(json));
  console.log(`схем: ${Object.keys(sorted).length} з ${Object.keys(places).length} (f1-circuits ${Object.values(sorted).filter((v) => v.source === "f1-circuits").length}, commons ${Object.values(sorted).filter((v) => v.source === "commons").length}); ${(size / 1024).toFixed(1)} КБ`);
  console.log(`без схеми (${missing.length}): ${missing.join(", ")}`);
  for (const [k, v] of Object.entries(sorted)) console.log(`  ${k.padEnd(16)} ${v.source.padEnd(11)} ${String(v.points).padStart(4)} точок ${v.w}×${v.h} ${v.file}${v.km !== undefined ? ` ${v.km} км` : ""}${v.element ? ` [${v.element}]` : ""}`);
  for (const r of report) console.log("  ! " + r);

  const review = arg("--review");
  if (review) {
    const cells = Object.entries(sorted)
      .map(([k, v]) => {
        const p = v.page;
        return `<figure><svg viewBox="-30 -30 ${p.w + 60} ${p.h + 60}"><path d="${p.d}"/></svg><figcaption>${k} · ${v.source} · rot ${p.rot}° · ${v.file}</figcaption></figure>`;
      })
      .join("");
    await writeFile(review, `<!doctype html><meta charset=utf-8><style>body{font:12px system-ui;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:8px}figure{margin:0;border:1px solid #ccc}svg{width:100%;aspect-ratio:200/124;display:block}path{fill:none;stroke:#111;stroke-width:8;stroke-linejoin:round}figcaption{padding:2px 4px}</style>${cells}`);
    console.log("перегляд:", review);
  }
}

await main();
