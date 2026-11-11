import type { NextConfig } from "next";
import { localeRewritePattern } from "./src/i18n/routing";

const isDev = process.env.NODE_ENV === "development";

// Без nonce: публічні сторінки статичні/ISR, а nonce вимикає статичний рендер
// (docs: 02-guides/content-security-policy.md, «Without Nonces»). 'unsafe-eval' — лише dev (Fast Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Обробники в атрибутах (<img onerror>) заборонені навіть при 'unsafe-inline' для <script>.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Лише продакшн: у dev (і з телефона по http://<IP у мережі>) апгрейд на https ламав би всі ресурси.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

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

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
      beforeFiles: [{ source: "/_global-error", destination: "/_not-found" }],
      afterFiles: [
        { source: "/", destination: "/en" },
        // Усе, крім мовних префіксів і службових/не-сторінкових шляхів (src/i18n/routing.ts), — англійська версія.
        { source: `/:path(${localeRewritePattern()})`, destination: "/en/:path" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
