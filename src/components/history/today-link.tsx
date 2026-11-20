"use client";

import { useEffect, useRef } from "react";

/**
 * «Сьогодні»: веде на сторінку поточної дати за годинником відвідувача. Дату знає лише браузер (сторінка статична),
 * тому в HTML — посилання на перелік усіх дат (так лишається й без JavaScript), а після гідратації href підміняється
 * на /history/ММ-ДД напряму в DOM (без стану React). Без Intl (fmt.ts: перший Intl у браузері дорогий).
 */
export function TodayLink({ base, label }: { base: string; label: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    if (ref.current) ref.current.setAttribute("href", `${base}/${mm}-${dd}`);
  }, [base]);
  return (
    <a ref={ref} className="oth-today" href={base}>
      {label}
    </a>
  );
}
