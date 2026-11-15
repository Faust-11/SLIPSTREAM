"use client";

import type { CSSProperties } from "react";

/**
 * Фото вибраної картки — кандидат LCP списку на телефоні (Lighthouse CI 15.11: lazy-фото чекало 1,7 с, LCP 4 с).
 * Клієнтський компонент навмисно (як SeasonPhoto): серверний <img> без lazy потрапляє в RSC-дані маршруту, і prefetch
 * пункту меню «Історії» передзавантажував фото на кожній сторінці (smoke). Тут — eager і fetchpriority=high.
 */
export function FeaturedPhoto({ src, srcSet, sizes, width, height, style }: { src: string; srcSet: string; sizes: string; width: number; height: number; style?: CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} srcSet={srcSet} sizes={sizes} width={width} height={height} alt="" style={style} decoding="async" fetchPriority="high" loading="eager" />
  );
}
