"use client";

import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/components/calendar/clock";
import { fill } from "@/i18n/fill";
import { normKey } from "@/lib/service/norm";

export type CreditsLabels = { search: string; placeholder: string; count: string; empty: string };

/**
 * Пошук у зведеному переліку авторів фото (836 рядків). Перелік рендерить сервер (`<ul id=listId>` з data-k у кожному
 * `<li>`), тут — лише поле й фільтр по DOM: інакше всі рядки вдруге їхали б у RSC-даних гідратації. Без JS — увесь
 * перелік, поля немає.
 */
export function CreditsSearch({ listId, emptyId, total, t }: { listId: string; emptyId: string; total: number; t: CreditsLabels }) {
  const hydrated = useHydrated();
  const [q, setQ] = useState("");
  // Лічильник оновлюємо в DOM з ефекту (кількість відома лише після фільтра по DOM), без setState в ефекті.
  const status = useRef<HTMLSpanElement>(null);
  const dq = normKey(useDeferredValue(q).trim());
  const id = useId();
  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    let c = 0;
    for (const li of Array.from(list.children) as HTMLElement[]) {
      const hit = !dq || (li.dataset.k ?? "").includes(dq);
      li.hidden = !hit;
      if (hit) c++;
    }
    const empty = document.getElementById(emptyId);
    if (empty) empty.hidden = c > 0;
    if (status.current) status.current.textContent = fill(t.count, { n: c, total });
  }, [dq, listId, emptyId, hydrated, t.count, total]);
  if (!hydrated) return null;
  return (
    <div className="sv-who" role="search">
      <label className="sr-only" htmlFor={id}>
        {t.search}
      </label>
      <input id={id} type="search" autoComplete="off" spellCheck={false} enterKeyHint="search" placeholder={t.placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="num" role="status" ref={status}>
        {fill(t.count, { n: total, total })}
      </span>
    </div>
  );
}
