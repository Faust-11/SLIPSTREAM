import type { NextConfig } from "next";
import { localeRewritePattern } from "./src/i18n/routing";

const isDev = process.env.NODE_ENV === "development";
// Збірка на Vercel (там своя маршрутизація RSC — див. rewrites).
const onVercel = process.env.VERCEL === "1";

// Без nonce: публічні сторінки статичні/ISR, а nonce вимикає статичний рендер
// (docs: 02-guides/content-security-policy.md, «Without Nonces»). 'unsafe-eval' — лише dev (Fast Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Обробники в атрибутах (<img onerror>) заборонені навіть при 'unsafe-inline' для <script>.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  // Прев'ю новин (фаза 4a, рішення 10.11): лише домени картинок видань — ті самі, що в src/lib/news/parse.ts IMAGE_HOSTS.
  "img-src 'self' data: blob: https://media.formula1.com https://*.motorsport.com https://i.ytimg.com",
  // Хайлайти гонок: плеєр YouTube без cookies — лише після кліку (src/components/race/race-video.tsx).
  "frame-src https://www.youtube-nocookie.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Лише продакшн: у dev (і з телефона по http://<IP у мережі>) апгрейд на https ламав би всі ресурси.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const adminCsp = csp.replace("img-src 'self'", "img-src 'self' https://thumb.wikimedia.org https://upload.wikimedia.org");

const PERMISSIONS_POLICY = [
  "accelerometer", "autoplay", "browsing-topics", "camera", "display-capture", "encrypted-media",
  "geolocation", "gyroscope", "hid", "idle-detection", "local-fonts", "magnetometer", "microphone", "midi",
  "payment", "screen-wake-lock", "serial", "usb", "window-management", "xr-spatial-tracking",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Без includeSubDomains/preload до рішення про домен (фаза 8): preload-заявку може подати будь-хто,
  // а вилучення зі списку триває місяці; на *.vercel.app увесь TLD .app і так у preload-списку.
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // Адмінка (фаза 7b): прев'ю Commons (мініатюри — thumb.wikimedia.org, малі оригінали — upload.wikimedia.org; замір
      // API 17.11). Той самий ключ заголовка пізніше в списку перекриває загальний (docs: next-config-js/headers.md).
      // Лише з cookie сесії: сторонній на /admin отримує 404 з тим самим CSP, що й /zzz (інакше значення заголовка видавало б адмінку).
      { source: "/admin/:path*", has: [{ type: "cookie", key: "ss_admin" }], headers: [{ key: "Content-Security-Policy", value: adminCsp }] },
    ];
  },

  experimental: {
    // Корінь застосунку — динамічний сегмент [lang]; 404 для невідомих адрес — app/global-not-found.tsx.
    globalNotFound: true,
  },

  // Мови: EN без префікса, UK під /uk. Правила конфігу, а не proxy: виконуються до динамічних маршрутів,
  // без виклику функції на кожен запит (docs: next-config-js/rewrites.md, «order Next.js routes are checked»).
  async redirects() {
    return [
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
