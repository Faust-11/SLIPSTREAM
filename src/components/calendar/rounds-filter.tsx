"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { plural } from "@/lib/plural";
import { noopSubscribe } from "./clock";

export const CALENDAR_FILTERS = ["all", "ahead", "done", "sprint"] as const;
export type CalendarFilter = (typeof CALENDAR_FILTERS)[number];
type PluralForms = { one: string; few: string; many: string; other: string };

function readUrlFilter(): CalendarFilter {
  const v = new URLSearchParams(window.location.search).get("f");
  return CALENDAR_FILTERS.includes(v as CalendarFilter) ? (v as CalendarFilter) : "all";
}

/**
 * Фільтр етапів: картки рендерить сервер (повний перелік і без JS), фільтр лише ставить data-f на сітку — CSS ховає
 * решту (дані карток не дублюються в клієнтських пропсах). Стан — у адресі (?f=), кількість — один role="status".
 */
export function RoundsFilter({ gridId, counts, locale, labels }: {
  gridId: string;
  counts: Record<CalendarFilter, number>;
  locale: Locale;
  labels: { filtersLabel: string; filters: Record<CalendarFilter, string>; count: PluralForms };
}) {
  // Початковий фільтр — з адреси (на сервері — «усі»); вибір користувача — поверх нього.
  const fromUrl = useSyncExternalStore(noopSubscribe, readUrlFilter, () => "all" as CalendarFilter);
  const [picked, setPicked] = useState<CalendarFilter | null>(null);
  const f = picked ?? fromUrl;
  useEffect(() => {
    const grid = document.getElementById(gridId);
    if (grid) grid.dataset.f = f;
    // Посилання з ?f=: до гідратації сітку сховано (themeScriptSource), щоб не показувати нефільтрований перелік.
    document.documentElement.removeAttribute("data-list-query");
  }, [f, gridId]);
  const pick = (v: CalendarFilter) => {
    setPicked(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "all") params.delete("f");
    else params.set("f", v);
    const s = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  };
  // Посилання на картку, сховану фільтром (клітинка смуги, «Наступна гонка» на ?f=done), — скидає фільтр на «Усі»
  // до переходу: сітку відкриваємо синхронно, тож типовий перехід за якорем уже бачить картку (рев'ю PR #19).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#r"]');
      const grid = document.getElementById(gridId);
      const card = a && grid ? document.getElementById(a.hash.slice(1)) : null;
      if (!card || !grid?.contains(card) || getComputedStyle(card).display !== "none") return;
      grid.dataset.f = "all";
      pick("all");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  });
  return (
    <>
      <div className="cl-chips" role="group" aria-label={labels.filtersLabel}>
        {CALENDAR_FILTERS.map((v) => (
          <button key={v} type="button" className="cl-chip" aria-pressed={f === v} onClick={() => pick(v)}>
            {fill(labels.filters[v], { n: counts[v] })}
          </button>
        ))}
      </div>
      <p className="cl-count-st num" role="status">
        {fill(plural(counts[f], locale, labels.count), { n: counts[f] })}
      </p>
    </>
  );
}
