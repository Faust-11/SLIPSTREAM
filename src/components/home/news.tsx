"use client";

import { useEffect, useRef, useState } from "react";
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
  morePosts: string;
  morePostsHref: string;
};

/**
 * Новини головної — клієнтом з /api/news (ISR 30 хв): сама головна статична (рішення користувача 14.11). Поки
 * завантажується — заглушка тієї ж висоти (без зсуву розкладки); без JS — лише посилання «Усі новини» в заголовку блока.
 */
export function HmNews({ locale, labels }: { locale: Locale; labels: HomeNewsLabels }) {
  const [data, setData] = useState<HomeNewsPayload | null | "error">(null);
  const hl = useRef<HTMLUListElement>(null);
  const posts = useRef<HTMLUListElement>(null);

  // Колонки / вкладки однієї висоти (відгук користувача 15.11: журналісти закінчувались значно нижче, а на телефоні
  // висоту перемикача задавала довша панель — під заголовками лишалась порожнеча): пости, що не вміщаються у висоту
  // списку заголовків, ховаємо цілими (не обрізаємо посередині); решта — на /news.
  useEffect(() => {
    const h = hl.current;
    const p = posts.current;
    if (!h || !p) return;
    const fit = () => {
      const items = [...p.children] as HTMLElement[];
      items.forEach((li) => (li.hidden = false));
      const limit = h.getBoundingClientRect().height;
      const top = p.getBoundingClientRect().top;
      let shown = 0;
      for (const li of items) {
        const fits = li.getBoundingClientRect().bottom - top <= limit;
        if (!fits && shown > 0) li.hidden = true;
        else shown++;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    return () => ro.disconnect();
  }, [data]);

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
      <ul ref={hl} className="hm-panel hm-hl" id="hm-nw-0" aria-label={labels.headlines}>
        {data.headlines.map((h) => (
          <li key={h.id}>
            <a href={h.url} rel="noopener" target="_blank" className={h.image ? "hm-hl-th" : undefined}>
              {h.image && (
                // Прев'ю видання — як на /news (рішення 10.11): сторонній домен із CSP img-src, декоративне — заголовок поруч.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="hm-th" src={h.image} alt="" width={480} height={270} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              )}
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
      <div className="hm-panel hm-posts-col" id="hm-nw-1">
      <ul ref={posts} className="hm-posts" aria-label={labels.posts}>
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
      <a className="hm-more" href={labels.morePostsHref}>
        {labels.morePosts}
      </a>
      </div>
    </HmSlider>
  );
}
