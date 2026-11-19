// Фавікони з одного джерела scripts/assets/roundel.svg (роундел Outlap). Запуск: node scripts/assets/favicons.mjs
// (потрібен установлений Google Chrome — растеризує playwright-core).
//
// - public/favicon.svg, 16 і 32 px — спрощений знак (коло + товста S): тонкі поребрики й контури на 16 px
//   зливаються в пляму, а SVG браузер малює саме у вкладці (16–32 px);
// - 48 px і більше — повний знак;
// - apple-touch-icon і maskable — на темному тлі шапки (#16181D): iOS заливає прозоре чорним, Android обрізає
//   maskable по колу/квадрату — знак у безпечній зоні (≤ 80 % стороні).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pub = fileURLToPath(new URL("../../public/", import.meta.url));
const full = readFileSync(fileURLToPath(new URL("./roundel.svg", import.meta.url)), "utf8");
const BG = "#16181D";

// Спрощений: лише коло та шлях S (stroke-width 9.2); поребрики (fill-шляхи) і тонкі контури (stroke-width 2) — геть.
const simple = full.replace(/<path [^>]*?(fill="#(E0301E|F3F4F1)"|stroke-width="2")[^>]*\/>/g, "");
if (simple === full || !/stroke-width="9\.2"/.test(simple)) throw new Error("спрощення знака не спрацювало — змінився roundel.svg?");
writeFileSync(pub + "favicon.svg", simple);

const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
/** Знак на квадраті size×size: mark — діаметр знака, bg — тло (null — прозоре). */
const compose = (svg, size, mark = size, bg = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
  (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : "") +
  `<svg x="${(size - mark) / 2}" y="${(size - mark) / 2}" width="${mark}" height="${mark}" viewBox="0 0 64 64">${inner(svg)}</svg></svg>`;

const jobs = [
  ["favicon-16x16.png", compose(simple, 16)],
  ["favicon-32x32.png", compose(simple, 32)],
  ["favicon-48x48.png", compose(full, 48)],
  ["favicon-96x96.png", compose(full, 96)],
  ["apple-touch-icon.png", compose(full, 180, 148, BG)],
  ["icon-192.png", compose(full, 192)],
  ["icon-512.png", compose(full, 512)],
  ["icon-maskable-512.png", compose(full, 512, 384, BG)],
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
  const e = 6 + 16 * i;
  head.writeUInt8(size, e);
  head.writeUInt8(size, e + 1);
  head.writeUInt8(0, e + 2);
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png[name].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += png[name].length;
});
writeFileSync(pub + "favicon.ico", Buffer.concat([head, ...parts.map(([n]) => png[n])]));
console.log("favicon.ico", offset, "B");
