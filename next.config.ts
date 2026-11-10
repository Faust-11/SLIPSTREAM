import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      beforeFiles: [],
      afterFiles: [
        { source: "/", destination: "/en" },
        // Усе, що не /uk…, /en… і не службове _next, — англійська версія.
        { source: "/:path((?!uk(?:/|$)|en(?:/|$)|_next/).*)", destination: "/en/:path" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
