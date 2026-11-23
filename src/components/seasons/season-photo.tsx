"use client";

import type { CSSProperties } from "react";

type Props = {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  /** Чемпіон і рік мовою сторінки (seasonPhotoAlt). */
  alt: string;
  /** Перша картка — кандидат LCP. */
  priority: boolean;
  eager: boolean;
  style?: CSSProperties;
  className?: string;
};

/**
 * Фото картки сезону. Клієнтський компонент навмисно: <img> без loading="lazy" у серверній розмітці потрапляє
 * в RSC-дані маршруту, і prefetch пункту меню «Сезони» з будь-якої іншої сторінки змушував React передзавантажувати
 * ці фото там («preloaded but not used», e2e smoke 12.11). Так само зроблено картки команд (клієнтський список).
 */
export function SeasonPhoto({ src, srcSet, sizes, width, height, alt, priority, eager, style, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      className={className}
      style={style}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      loading={eager ? "eager" : "lazy"}
    />
  );
}
