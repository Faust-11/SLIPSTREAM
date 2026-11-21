"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { HomeDay } from "@/lib/data/home-day";
import { fill } from "@/i18n/fill";

export type HomeOtdLabels = {
  title: string;
  tags: { race: string; born: string; died: string };
  all: string;
  more: string;
  loading: string;
  error: string;
  nearest: string;
  nav: string;
  months: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Ключ сьогоднішнього дня за годинником відвідувача; на сервері — null (дата невідома, головна статична). */
const clientToday = () => {
  const now = new Date();
  return `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const noSubscribe = () => () => {};
const serverToday = () => null;
const label = (key: string, months: string[]) => `${Number(key.slice(3))} ${months[Number(key.slice(0, 2)) - 1]}`;

/**
 * «Цей день у Формулі-1» у шапці головної. Сама головна статична й дати не знає: після гідратації беремо день за
 * годинником відвідувача (без Intl — fmt.ts) і підвантажуємо готовий JSON дня з /api/on-this-day (статичні файли).
 * Дата й число з'являються одразу, події — після відповіді; поки чекаємо, лишається заглушка тієї ж висоти (без зсуву
 * розкладки), а без JavaScript — заголовок і посилання на перелік усіх дат.
 */
export function HmOnThisDay({ locale, base, labels }: { locale: string; base: string; labels: HomeOtdLabels }) {
  const today = useSyncExternalStore<string | null>(noSubscribe, clientToday, serverToday);
  const [data, setData] = useState<HomeDay | "error" | null>(null);

  useEffect(() => {
    if (!today) return;
    const ctl = new AbortController();
    fetch(`/api/on-this-day/${locale}/${today}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<HomeDay>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setData("error");
      });
    return () => ctl.abort();
  }, [locale, today]);

  const shown = data && data !== "error" ? data.key : today;
  const ok = data && data !== "error" ? data : null;
  const href = (key: string) => `${base}/${key}`;

  return (
    <aside className="hm-otd" aria-labelledby="hm-otd-h">
      <div className="hm-otd-top">
        <b className="hm-otd-num display num" aria-hidden="true">
          {shown ? Number(shown.slice(3)) : "·"}
        </b>
        <div>
          <h2 className="display" id="hm-otd-h">
            {labels.title}
          </h2>
          <p className="hm-otd-date">
            {shown ? label(shown, labels.months) : " "}
            {ok && !ok.exact ? ` · ${labels.nearest}` : ""}
          </p>
        </div>
      </div>
      {ok ? (
        <ol className="hm-otd-list" role="list">
          {ok.events.map((e) => (
            <li key={`${e.kind}-${e.href}`} className={`hm-otd-ev hm-otd-${e.kind}`}>
              <span className="hm-otd-yr display num">{e.year}</span>
              <div>
                <span className="hm-otd-tag">{labels.tags[e.kind]}</span>
                <a className="hm-otd-name" href={e.href}>
                  {e.title}
                </a>
                {e.sub && <span className="hm-otd-sub">{e.sub}</span>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="hm-otd-list hm-otd-wait" aria-busy={data === null} role={data === "error" ? "status" : undefined}>
          {data === "error" ? <p>{labels.error}</p> : <p className="hm-sr">{labels.loading}</p>}
          {data === "error" ? null : [0, 1, 2].map((i) => <span key={i} className="hm-otd-sk" aria-hidden="true" />)}
        </div>
      )}
      <nav className="hm-otd-nav" aria-label={labels.nav}>
        <a className="hm-otd-all" href={ok ? href(ok.key) : base}>
          {labels.all}
          {ok && ok.more > 0 ? ` (${fill(labels.more, { n: ok.more })})` : ""} →
        </a>
        {ok && (
          <>
            <a href={href(ok.prev)} rel="prev">
              ← {label(ok.prev, labels.months)}
            </a>
            <a href={href(ok.next)} rel="next">
              {label(ok.next, labels.months)} →
            </a>
          </>
        )}
      </nav>
    </aside>
  );
}
