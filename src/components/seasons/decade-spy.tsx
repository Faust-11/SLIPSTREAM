"use client";

import { useEffect } from "react";

/**
 * Позначає чип десятиліття, яке зараз на екрані (aria-current — для екранних читачів і стилю).
 * Де є CSS `scroll-target-group` (Chrome 140+), вигляд дає `:target-current`, а скрипт лише дублює стан у aria-current
 * після зупинки прокрутки; деінде (Safari, Firefox) — IntersectionObserver. Без JS чипи — звичайні якорі.
 * Настанова modern-web-guidance «Scrollspy».
 */
export function DecadeSpy({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!nav) return;
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const mark = (current: Element | null) =>
      links.forEach((a) => (a === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    if (CSS.supports("scroll-target-group: auto")) {
      const sync = () => mark(nav.querySelector("a:target-current"));
      sync();
      document.addEventListener("scrollend", sync);
      return () => document.removeEventListener("scrollend", sync);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) mark(links.find((a) => a.hash === `#${e.target.id}`) ?? null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const a of links) {
      const target = document.getElementById(a.hash.slice(1));
      if (target) io.observe(target);
    }
    return () => io.disconnect();
  }, [navId]);
  return null;
}
