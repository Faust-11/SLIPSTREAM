// Фавікони й іконки застосунку з векторного знака Outlap (public/brand/outlap-mark-for-dark.svg — результат
// scripts/assets/logo_trace.py). Запуск: node scripts/assets/favicons.mjs (потрібен установлений Google Chrome —
// растеризує playwright-core).
//
// Знак (дуга з бордюром, світла версія + червоний) стоїть на темній плитці #16181D — так він читається і на світлій, і на
// темній вкладці. Плитка в favicon.svg/16/32/48/96 — із закругленням; apple-touch-icon і maskable — суцільне тло на весь
// квадрат (iOS заливає прозоре чорним, Android обрізає maskable по колу/квадрату — знак у безпечній зоні ≤ 80 %).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pub = fileURLToPath(new URL("../../public/", import.meta.url));
const BG = "#16181D";

const src = readFileSync(pub + "brand/outlap-mark-for-dark.svg", "utf8");
const [vx, vy, vw, vh] = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const inner = src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/**
 * Плитка size×size: bg — тло (null — прозоре), r — радіус закруглення (частка сторони), mark — частка сторони під знак.
 * Знак вписується за більшою стороною й центрується.
 */
/**
 * Утовщений знак для малих розмірів (16–48 px): тонкі лінії бордюру на 16 px зливаються в сіру пляму (так було й у
 * першій версії фавікона — тоді знак спрощували). Світле тіло й червоні смуги обводимо контуром (одиниці viewBox знака):
 * порядок — світле з обводкою, червоне з обводкою, світле без обводки (повертає дрібні світлі деталі поверх червоного).
 */
const paths = [...inner.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
if (paths.length === 0 || paths.join("") !== inner.trim()) throw new Error("знак має містити лише <path> — оновіть утовщення");
const isRed = (p) => /fill="#DD1A1F"/i.test(p);
const stroked = (p, w) => p.replace("<path", `<path stroke="${isRed(p) ? "#DD1A1F" : "#F3F4F1"}" stroke-width="${w}" stroke-linejoin="round"`);
const boldInner = (body, red) =>
  paths.filter((p) => !isRed(p)).map((p) => stroked(p, body)).join("") +
  paths.filter(isRed).map((p) => stroked(p, red)).join("") +
  paths.filter((p) => !isRed(p)).join("");

const tile = (size, { r = 0, mark = 0.7, bg = BG, bold = null } = {}) => {
  const k = (size * mark) / Math.max(vw, vh);
  const w = vw * k;
  const h = vh * k;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    (bg ? `<rect width="${size}" height="${size}" rx="${size * r}" fill="${bg}"/>` : "") +
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible">${bold ? boldInner(bold[0], bold[1]) : inner}</svg></svg>`
  );
};

// favicon.svg — векторна плитка 64×64 із закругленням.
writeFileSync(pub + "favicon.svg", tile(64, { r: 0.18, mark: 0.9 }) + "\n");

const jobs = [
  ["favicon-16x16.png", tile(16, { r: 0.18, mark: 0.84, bold: [34, 17] })],
  ["favicon-32x32.png", tile(32, { r: 0.18, mark: 0.87, bold: [13, 6.5] })],
  ["favicon-48x48.png", tile(48, { r: 0.18, mark: 0.88, bold: [9, 4.5] })],
  ["favicon-96x96.png", tile(96, { r: 0.18, mark: 0.9 })],
  ["apple-touch-icon.png", tile(180, { mark: 0.66 })],
  ["icon-192.png", tile(192, { r: 0.2, mark: 0.72 })],
  ["icon-512.png", tile(512, { r: 0.2, mark: 0.72 })],
  ["icon-maskable-512.png", tile(512, { mark: 0.56 })],
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const png = {};
for (const [name, svg] of jobs) {
  const size = Number(svg.match(/width="(\d+)"/)[1]);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  png[name] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(pub + name, png[name]);
  console.log(name, size, png[name].length, "B");
}
await browser.close();

// favicon.ico — PNG усередині ICO (Vista+; усі сучасні браузери): 16, 32, 48.
const parts = [["favicon-16x16.png", 16], ["favicon-32x32.png", 32], ["favicon-48x48.png", 48]];
const head = Buffer.alloc(6 + 16 * parts.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(parts.length, 4);
let offset = head.length;
parts.forEach(([name, size], i) => {
  const o = 6 + 16 * i;
  head.writeUInt8(size, o);
  head.writeUInt8(size, o + 1);
  head.writeUInt8(0, o + 2);
  head.writeUInt8(0, o + 3);
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(png[name].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += png[name].length;
});
writeFileSync(pub + "favicon.ico", Buffer.concat([head, ...parts.map(([name]) => png[name])]));
console.log("favicon.ico", offset, "B");
