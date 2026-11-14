"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { noopSubscribe } from "@/components/calendar/clock";
import { fill } from "@/i18n/fill";

export const NEWS_VIEWS = ["all", "rss", "bsky"] as const;
export type NewsView = (typeof NEWS_VIEWS)[number];

function readUrlView(): NewsView {
  const v = new URLSearchParams(window.location.search).get("v");
  return NEWS_VIEWS.includes(v as NewsView) ? (v as NewsView) : "all";
}

/**
 * Вкладки «Усе / Видання / Журналісти»: обидві колонки рендерить сервер (без JS видно все), вкладка лише ставить
 * data-v на контейнер — CSS ховає іншу колонку. Стан — у адресі (?v=).
 */
export function NewsTabs({ targetId, counts, labels }: { targetId: string; counts: Record<NewsView, number>; labels: { tabsLabel: string; tabs: Record<NewsView, string> } }) {
  const fromUrl = useSyncExternalStore(noopSubscribe, readUrlView, () => "all" as NewsView);
  const [picked, setPicked] = useState<NewsView | null>(null);
  const v = picked ?? fromUrl;
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.dataset.v = v;
    // Вкладку з адреси до першого кадру ставив ThemeScript (html[data-nw-v]); далі стан — у контейнері.
    document.documentElement.removeAttribute("data-nw-v");
  }, [v, targetId]);
  const pick = (next: NewsView) => {
    setPicked(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "all") params.delete("v");
    else params.set("v", next);
    const s = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  };
  return (
    <div className="nw-tabs" role="group" aria-label={labels.tabsLabel}>
      {NEWS_VIEWS.map((x) => (
        <button key={x} type="button" className="nw-tab" aria-pressed={v === x} onClick={() => pick(x)}>
          {fill(labels.tabs[x], { n: counts[x] })}
        </button>
      ))}
    </div>
  );
}
