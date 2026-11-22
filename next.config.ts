import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { localeRewritePattern } from "./src/i18n/routing";
import { TURNSTILE_ORIGIN } from "./src/lib/play/turnstile";
import { parseRedirects, storyRedirectRules } from "./src/lib/stories/redirects";

const isDev = process.env.NODE_ENV === "development";
// Збірка на Vercel (там своя маршрутизація RSC — див. rewrites).
const onVercel = process.env.VERCEL === "1";

// Без nonce: публічні сторінки статичні/ISR, а nonce вимикає статичний рендер
// (docs: 02-guides/content-security-policy.md, «Without Nonces»). 'unsafe-eval' — лише dev (Fast Refresh).
// Turnstile (вхід, 21.11): домен Cloudflare в політиці ЛИШЕ коли ключ віджета заданий при збірці — без нього політика не змінюється.

/** Політика CSP; експорт — для unit-тесту (параметри замість env). */
export function buildCsp({ dev, turnstile }: { dev: boolean; turnstile: boolean }): string {
  const cf = turnstile ? ` ${TURNSTILE_ORIGIN}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${cf}`,
    // Обробники в атрибутах (<img onerror>) заборонені навіть при 'unsafe-inline' для <script>.
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    // Прев'ю новин (фаза 4a, рішення 10.11): лише домени картинок видань — ті самі, що в src/lib/news/parse.ts IMAGE_HOSTS.
    // + Wikimedia — прев'ю Commons в адмінці (фаза 7b). Для всього сайту, а не правилом для /admin: інакше значення CSP на
    // /admin (навіть з підробленим cookie) відрізнялось би від неіснуючої сторінки й видавало адмінку (рев'ю 7b).
    "img-src 'self' data: blob: https://media.formula1.com https://*.motorsport.com https://i.ytimg.com https://thumb.wikimedia.org https://upload.wikimedia.org",
    // Хайлайти гонок: плеєр YouTube без cookies — лише після кліку (src/components/race/race-video.tsx).
    `frame-src https://www.youtube-nocookie.com${cf}`,
    "font-src 'self'",
    `connect-src 'self'${cf}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Лише продакшн: у dev (і з телефона по http://<IP у мережі>) апгрейд на https ламав би всі ресурси.
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
const csp = buildCsp({ dev: isDev, turnstile: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) });

const PERMISSIONS_POLICY = [
  "accelerometer", "autoplay", "browsing-topics", "camera", "display-capture", "encrypted-media",
  "geolocation", "gyroscope", "hid", "idle-detection", "local-fonts", "magnetometer", "microphone", "midi",
  "payment", "screen-wake-lock", "serial", "usb", "window-management", "xr-spatial-tracking",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Без includeSubDomains/preload: preload-заявку (hstspreload.org) подаємо окремим рішенням, коли всі піддомени
  // outlap.org точно на HTTPS — вилучення зі списку триває місяці.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Вимкнено все, що сайту не потрібне. Лише ознаки, відомі і Chrome 150, і Chromium Playwright 1.64:
  // невідома ознака дає попередження в консолі (bluetooth — так, CI 11.11). Не чіпаємо
  // publickey-credentials-get / identity-credentials-get — знадобляться для входу (фаза 9).
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  // Дублює frame-ancestors для старих браузерів.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Канонічний хост (без www) і хости, що на нього редіректяться. Експорт — для unit-тесту.
export const CANONICAL_ORIGIN = "https://outlap.org";
export const CANONICAL_REDIRECT_HOSTS = ["www.outlap.org", "slipstream-bice-eight.vercel.app"];

// Старі адреси історій (адмінка 7c пише сюди при зміні адреси). Немає файла чи він зіпсований — просто без редиректів.
const storyRedirects = (() => {
  try {
    return parseRedirects(JSON.parse(readFileSync(join(process.cwd(), "src/data/curated/story-redirects.json"), "utf8")));
  } catch {
    return {};
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    // Лише власні фото з public/img (вільні ліцензії); сторонніх джерел немає — remotePatterns не потрібні.
    localPatterns: [{ pathname: "/img/**", search: "" }],
    // У Next 16 перелік якостей обов'язковий (docs image.md, qualities).
    qualities: [75],
    // Оригінали ≤ 480 px (боліди) і 112 px (аватари): ширші варіанти srcset давали б дублікати
    // перетворень (Vercel рахує кожне). Аватар 28 px → 32/64; картка 304–488 px → 384/480/640/828.
    imageSizes: [32, 64, 128, 256, 384],
    deviceSizes: [480, 640, 828, 1080],
  },

  // Адмінка рендериться на запит і читає content/stories (Огляд; далі — редактор історій): файли — у функцію Vercel.
  outputFileTracingIncludes: {
    "/admin": ["./content/stories/**/*"],
    "/admin/**": ["./content/stories/**/*"],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  experimental: {
    // Власне фото в адмінці (фаза 7b): браузер стискає до ≤ 3,8 МБ, Vercel пропускає тіло функції до 4,5 МБ. Типово — 1 МБ
    // (code-review 7b: 2560 px JPEG телефона — 1,5–3 МБ). Публічний сайт server actions не має.
    serverActions: { bodySizeLimit: "4mb" },
    // Корінь застосунку — динамічний сегмент [lang]; 404 для невідомих адрес — app/global-not-found.tsx.
    globalNotFound: true,
  },

  // Мови: EN без префікса, UK під /uk. Правила конфігу, а не proxy: виконуються до динамічних маршрутів,
  // без виклику функції на кожен запит (docs: next-config-js/rewrites.md, «order Next.js routes are checked»).
  async redirects() {
    return [
      // Домен сайту — outlap.org (без www). Стара адреса Vercel і www ведуть на нього тим самим шляхом (308), щоб
      // посилання, закладки й пошук не розходилися між хостами. Лише ці точні хости: прев'ю Vercel не зачіпаємо.
      ...CANONICAL_REDIRECT_HOSTS.map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      })),

      ...storyRedirectRules(storyRedirects),
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return {
      // Служебна сторінка Next доступна за прямою адресою й відповідає 500 — ховаємо за 404.
      // Службова сторінка Next доступна за прямою адресою й відповідає 500 — на неіснуючу адресу (404).
      // (Rewrite на /_not-found на Vercel віддавав сторінку 404 зі статусом 200 — замір прев'ю 11.11.)
      beforeFiles: [
        { source: "/_global-error", destination: "/en/_global-error" },
        // Адмінка (фаза 7): без cookie сесії / ключа входу / стану входу — на /en/admin/… (той самий 404, що й будь-яка
        // неіснуюча адреса). Саме правилом конфігу, а не proxy: rewrite у proxy додає до відповіді x-middleware-rewrite
        // (e2e 15.11 — заголовки /admin відрізнялись від /zzz). Назви cookie — src/lib/admin/token.ts (тест звіряє).
        {
          source: "/admin/auth/:step(login|github|email|code|verify)",
          missing: [{ type: "query", key: "key" }],
          destination: "/en/admin/auth/:step",
        },
        { source: "/admin/auth/callback", missing: [{ type: "cookie", key: "ss_admin_flow" }], destination: "/en/admin/auth/callback" },
        { source: "/admin", missing: [{ type: "cookie", key: "ss_admin" }], destination: "/en/admin" },
        {
          source: "/admin/:path((?!auth/(?:login|github|email|code|verify|callback)$).+)",
          missing: [{ type: "cookie", key: "ss_admin" }],
          destination: "/en/admin/:path",
        },
      ],
      afterFiles: [
        // Vercel: RSC-навігація на корінь (без segment-prefetch) приходила як «/» і віддавала HTML /en
        // (x-matched-path: /en) — клієнт перезавантажував сторінку. На next start цього немає.
        ...(onVercel
          ? [
              {
                source: "/",
                has: [{ type: "header" as const, key: "rsc" }],
                missing: [{ type: "header" as const, key: "next-router-segment-prefetch" }],
                destination: "/en.rsc",
              },
            ]
          : []),
        { source: "/", destination: "/en" },
        // Vercel внутрішньо називає корінь «index»: RSC-запити головної приходять як /index.rsc і
        // /index.segments/… (замір x-matched-path на прев'ю 11.11). Без цих правил catch-all нижче дає
        // /en/index.segments/… → 404, і клієнтський перехід на головну перезавантажує сторінку.
        { source: "/index.rsc", destination: "/en.rsc" },
        { source: "/index.segments/:path*", destination: "/en.segments/:path*" },
        // Усе, крім мовних префіксів і службових/не-сторінкових шляхів (src/i18n/routing.ts), — англійська версія.
        { source: `/:path(${localeRewritePattern()})`, destination: "/en/:path" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
