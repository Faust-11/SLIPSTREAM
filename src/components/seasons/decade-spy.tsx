"use client";

import { useEffect } from "react";

/**
 * Позначає чип десятиліття, яке зараз на екрані: aria-current — для екранних читачів і стилю в усіх браузерах
 * (IntersectionObserver). Де є CSS `scroll-target-group` (Chrome 140+), той самий вигляд дає `:target-current`
 * ще до запуску скрипта. Без JS чипи — звичайні якорі. Настанова modern-web-guidance «Scrollspy».
 * Спроба брати стан з `a:target-current` після `scrollend` (як у настанові) у e2e не проставляла aria-current
 * після переходу за якорем (12.11) — тому спостерігач один для всіх браузерів.
 */
/** Ідентифікатор цілі посилання: hash закодований (кирилиця глав історій — %D0…), id — ні (рев'ю PR #36). */
const idOf = (a: HTMLAnchorElement) => decodeURIComponent(a.hash.slice(1));

export function DecadeSpy({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!nav) return;
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const strip = links[0]?.parentElement;
    const mark = (current: HTMLAnchorElement | null) => {
      links.forEach((a) => (a === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      // На телефоні смуга чипів прокручується вбік — активний чип має бути видно (лише горизонтальний зсув смуги).
      if (current && strip && (current.offsetLeft < strip.scrollLeft || current.offsetLeft + current.offsetWidth > strip.scrollLeft + strip.clientWidth))
        strip.scrollTo({ left: Math.max(0, current.offsetLeft - 16) });
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) mark(links.find((a) => idOf(a) === e.target.id) ?? null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const a of links) {
      const target = document.getElementById(idOf(a));
      if (target) io.observe(target);
    }
    return () => io.disconnect();
  }, [navId]);
  return null;
}
