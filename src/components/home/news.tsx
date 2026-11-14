"use client";

import { useEffect, useState } from "react";
import type { HomeNewsPayload } from "@/app/api/news/route";
import { Ago } from "@/components/news/ago";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { HmSlider } from "./slider";

export type HomeNewsLabels = {
  tabs: string;
  headlines: string;
  posts: string;
  loading: string;
  empty: string;
  post: string;
  sources: Record<string, string>;
};

/**
 * Новини головної — клієнтом з /api/news (ISR 30 хв): сама головна статична (рішення користувача 14.11). Поки
 * завантажується — заглушка тієї ж висоти (без зсуву розкладки); без JS — лише посилання «Усі новини» в заголовку блока.
 */
export function HmNews({ locale, labels }: { locale: Locale; labels: HomeNewsLabels }) {
  const [data, setData] = useState<HomeNewsPayload | null | "error">(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/news")
      .then((r) => (r.ok ? (r.json() as Promise<HomeNewsPayload>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setData(d))
      .catch(() => alive && setData("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (data === null) {
    return (
      <div className="hm-news-wait" aria-busy="true">
        <span className="hm-sr">{labels.loading}</span>
      </div>
    );
  }
  if (data === "error" || (data.headlines.length === 0 && data.posts.length === 0)) {
    return <p className="hm-src hm-news-empty">{labels.empty}</p>;
  }
  return (
    <HmSlider id="hm-nw" label={labels.tabs} tabs={[labels.headlines, labels.posts]}>
      <ul className="hm-panel hm-hl" id="hm-nw-0" aria-label={labels.headlines}>
        {data.headlines.map((h) => (
          <li key={h.id}>
            <a href={h.url} rel="noopener" target="_blank">
              <span className="hm-hl-t">{h.title}</span>
              <span className="hm-hl-m">
                {labels.sources[h.source] ?? h.source}
                {h.publishedAt && (
                  <>
                    {" · "}
                    <Ago iso={h.publishedAt} locale={locale} />
                  </>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <ul className="hm-panel hm-posts" id="hm-nw-1" aria-label={labels.posts}>
        {data.posts.map((p) => (
          <li key={p.id}>
            <span className="hm-post-who">
              <b>{p.name}</b> <span>@{p.handle}</span>
            </span>
            <p>{p.text}</p>
            <a href={p.url} rel="noopener" target="_blank" className="hm-post-link">
              <Ago iso={p.createdAt} locale={locale} />
              <span className="hm-sr"> {fill(labels.post, { name: p.name })}</span>
            </a>
          </li>
        ))}
      </ul>
    </HmSlider>
  );
}
