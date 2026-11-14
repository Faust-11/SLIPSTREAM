"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Дві-три панелі поруч у горизонтальному скролі зі scroll-snap (макет «Чемпіонат»): без JS — гортаються пальцем або
 * Shift+коліщатком, усі панелі в DOM і доступні; кнопки над ними — перемикач, що прокручує до панелі й показує, яка
 * зараз видна (scrollsnapchange там, де є; інакше IntersectionObserver — гайд «Scroll Snap State Sync»).
 */
export function HmSlider({ id, label, tabs, children }: { id: string; label: string; tabs: string[]; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const panels = [...el.children] as HTMLElement[];
    const onSnap = (e: Event) => {
      const t = (e as Event & { snapTargetInline?: Element | null }).snapTargetInline;
      const i = t ? panels.indexOf(t as HTMLElement) : -1;
      if (i >= 0) setActive(i);
    };
    if ("onscrollsnapchange" in HTMLElement.prototype) {
      el.addEventListener("scrollsnapchange", onSnap);
      return () => el.removeEventListener("scrollsnapchange", onSnap);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) setActive(panels.indexOf(en.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    panels.forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, []);

  // Панель поза видимою частиною контейнера — inert (після гідратації): Tab не веде в сховані посилання й не смикає
  // контейнер убік (рев'ю PR #25). За видимістю, а не за вкладкою: на широкому екрані новини — дві колонки, видно обидві.
  // Без JS панелі звичайні — їх гортають пальцем.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) (en.target as HTMLElement).inert = en.intersectionRatio < 0.5;
      },
      { root: el, threshold: [0, 0.5, 1] },
    );
    [...el.children].forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => {
    const el = box.current;
    const p = el?.children[i] as HTMLElement | undefined;
    if (!el || !p) return;
    setActive(i);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // .hm-slider — position: relative, тож offsetLeft панелі відраховується від початку вмісту контейнера.
    el.scrollTo({ left: p.offsetLeft, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      {tabs.length > 1 && (
        <div className="hm-tabs" role="group" aria-label={label}>
          {tabs.map((t, i) => (
            <button key={t} type="button" aria-pressed={active === i} aria-controls={`${id}-${i}`} onClick={() => go(i)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="hm-slider" id={id}>
        {children}
      </div>
    </>
  );
}
