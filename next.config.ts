import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Корінь застосунку — динамічний сегмент [lang]; 404 для невідомих адрес — app/global-not-found.tsx.
    globalNotFound: true,
  },
};

export default nextConfig;
