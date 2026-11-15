"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { noopSubscribe } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { plural } from "@/lib/plural";
import { STORY_FILTERS, type StoryFilter } from "@/lib/stories/filters";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

function readUrlFilter(): StoryFilter {
  const v = new URLSearchParams(window.location.search).get("c");
  return STORY_FILTERS.includes(v as StoryFilter) ? (v as StoryFilter) : "all";
}

/**
 * Фільтр рубрик: картки рендерить сервер (усі — і без JS), фільтр лише ставить data-c на список — CSS ховає решту
 * (як фільтр етапів календаря). Стан — в адресі (?c=), кількість — один role="status". Без JS чипів не видно.
 */
export function StoriesFilter({ listId, counts, locale, labels }: {
  listId: string;
  counts: Record<StoryFilter, number>;
  locale: Locale;
  labels: { filtersLabel: string; filters: Record<StoryFilter, string>; count: PluralForms; empty: string };
}) {
  const fromUrl = useSyncExternalStore(noopSubscribe, readUrlFilter, () => "all" as StoryFilter);
  const [picked, setPicked] = useState<StoryFilter | null>(null);
  const c = picked ?? fromUrl;
  useEffect(() => {
    const list = document.getElementById(listId);
    if (list) {
      list.dataset.c = c;
      // Непарна кількість карток у сітці — остання на всю ширину (без порожньої половини рядка).
      const items = [...list.querySelectorAll<HTMLElement>(".st-grid > li")];
      const shown = items.filter((li) => c === "all" || li.dataset.cat === c);
      items.forEach((li) => li.classList.remove("st-wide"));
      if (shown.length % 2 === 1 && shown.length > 1) shown[shown.length - 1]!.classList.add("st-wide");
      else if (shown.length === 1) shown[0]!.classList.add("st-wide");
    }
    // Посилання з ?c=: до гідратації список сховано (themeScriptSource), щоб не блимав нефільтрований перелік.
    document.documentElement.removeAttribute("data-list-query");
  }, [c, listId]);
  const pick = (v: StoryFilter) => {
    setPicked(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "all") params.delete("c");
    else params.set("c", v);
    const s = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  };
  // Точка на лінійці років веде до картки — якщо її сховано фільтром, спершу показати всі.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#story-"]');
      const list = document.getElementById(listId);
      const card = a && list ? document.getElementById(a.hash.slice(1)) : null;
      // Картку ховає предок (li з data-cat) — перевіряємо, чи вона взагалі відмальована.
      if (!card || !list?.contains(card) || card.getClientRects().length > 0) return;
      list.dataset.c = "all";
      pick("all");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  });
  return (
    <>
      <div className="st-chips" role="group" aria-label={labels.filtersLabel}>
        {STORY_FILTERS.filter((v) => v === "all" || counts[v] > 0).map((v) => (
          <button key={v} type="button" className="st-chip" aria-pressed={c === v} onClick={() => pick(v)}>
            {fill(labels.filters[v], { n: counts[v] })}
          </button>
        ))}
      </div>
      <p className="st-count num" role="status">
        {counts[c] > 0 ? fill(plural(counts[c], locale, labels.count), { n: counts[c] }) : labels.empty}
      </p>
    </>
  );
}
