"use client";

import { useEffect } from "react";

/**
 * Прокручувані списки головної (залік, рекорди — як у макеті): маска-затухання внизу підказує, що є ще; дочитали до
 * кінця або список не прокручується — маску прибираємо (data-end). Без JS маска лишається — список однаково гортається.
 */
export function HmFades() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".hm-fade")];
    const update = (el: HTMLElement) => {
      el.toggleAttribute("data-end", el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    };
    const onScroll = (e: Event) => update(e.currentTarget as HTMLElement);
    const ro = new ResizeObserver((entries) => entries.forEach((en) => update(en.target as HTMLElement)));
    for (const el of els) {
      update(el);
      el.addEventListener("scroll", onScroll, { passive: true });
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      for (const el of els) el.removeEventListener("scroll", onScroll);
    };
  }, []);
  return null;
}
