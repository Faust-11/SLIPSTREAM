import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Ago } from "@/components/news/ago";
import { MoreButton } from "@/components/news/more-button";
import { NewsTabs } from "@/components/news/news-tabs";
import { NextRaceLink, type NextRaceItem } from "@/components/news/next-race-link";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getCalendarPage } from "@/lib/data/calendar";
import { BSKY_HANDLES, getNews, RSS_SOURCES, type Headline, type Post, type SourceKey } from "@/lib/data/news";
import { plural } from "@/lib/plural";
import { pageMetadata } from "@/lib/seo";

// ISR: новини збираються щонайбільше раз на 30 хв (рішення користувача 14.11; кеш fetch — той самий).
export const revalidate = 1800;

type Props = { params: Promise<{ lang: string }> };

/** Записів на сторінку списку до «Показати ще» (макет: 12 заголовків / 20 постів). */
const HEADLINES_STEP = 12;
const POSTS_STEP = 20;

const SOURCE: Record<SourceKey, { name: string; color: string }> = {
  f1: { name: "Formula 1", color: "#E10600" },
  motorsport: { name: "Motorsport.com", color: "#FF8000" },
  autosport: { name: "Autosport", color: "#2F7BD9" },
};
const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return pageMetadata({ locale: lang, path: "/news", title: dict.newsPage.title, description: dict.newsPage.metaDescription });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("");

export default async function NewsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.newsPage;
  const [news, calendar] = await Promise.all([getNews(), getCalendarPage(lang)]);
  const n = (v: number) => fmt[lang].format(v);
  const upcoming: NextRaceItem[] = calendar.cards
    .filter((c) => c.state !== "done" && c.raceTimed && c.raceAt)
    .map((c) => ({ round: c.round, gp: c.gp, raceAt: c.raceAt!, href: localizedPath(`/calendar#r${c.round}`, lang) }));
  const empty = news.headlines.length === 0 && news.posts.length === 0;

  const headline = (h: Headline, i: number) => (
    <li key={h.id} className="nw-hl" data-page={Math.floor(i / HEADLINES_STEP) || undefined}>
      {h.image ? (
        // Прев'ю видання (рішення 10.11): сторонній домен із CSP img-src; лише декоративне — посилання поруч.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="nw-th" src={h.image} alt="" width={480} height={270} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : (
        <span className="nw-th nw-th-none" aria-hidden="true" />
      )}
      <div className="nw-hb">
        <div className="nw-meta">
          <span className="nw-src" style={{ "--c": SOURCE[h.source].color } as CSSProperties}>
            {SOURCE[h.source].name}
          </span>
          {h.publishedAt && <Ago iso={h.publishedAt} locale={lang} />}
        </div>
        <h3>
          <a href={h.url} rel="noopener" target="_blank">
            {h.title}
          </a>
        </h3>
        {h.summary && <p>{h.summary}</p>}
        {h.also.length > 0 && (
          <p className="nw-also">
            {t.also}{" "}
            {h.also.map((a) => (
              <a key={a.url} href={a.url} rel="noopener" target="_blank">
                {SOURCE[a.source].name}
              </a>
            ))}
          </p>
        )}
      </div>
    </li>
  );

  const post = (p: Post, i: number) => (
    <li key={p.id} className="nw-po" data-page={Math.floor(i / POSTS_STEP) || undefined}>
      <div className="nw-who">
        <span className="nw-pav" aria-hidden="true">
          {initials(p.name)}
        </span>
        <span className="nw-name">
          <b>{p.name}</b>
          <span>@{p.handle}</span>
        </span>
        <Ago iso={p.createdAt} locale={lang} />
      </div>
      <p className="nw-text">{p.text}</p>
      {/* Однаковий текст 40 посилань — автор у доступній назві (WCAG 2.4.4, рев'ю PR #20); видимий текст лишається
          її початком (WCAG 2.5.3 — тому прихований фрагмент, а не aria-label). */}
      <a className="nw-open" href={p.url} rel="noopener" target="_blank">
        {t.openBsky}
        <span className="sr-only nw-sr">{fill(t.openBskyAuthor, { name: p.name })}</span>
      </a>
    </li>
  );

  const hlPages = Math.ceil(news.headlines.length / HEADLINES_STEP);
  const poPages = Math.ceil(news.posts.length / POSTS_STEP);

  return (
    <div className="nw-page">
      <section className="nw-hero">
        <div className="wrap">
          <div className="nw-ttl">
            {/* Рядки заголовка фіксовані (у словнику «|» — межа рядка), без переносу, кегль — від найдовшого рядка: висота
                не залежить від шрифту (CLS 0,10 на 390 px під час підміни кирилиці Rubik Mono One, рев'ю PR #20). */}
            <h1 className="display" style={{ "--n": Math.max(...[t.title, ...t.titleAccent.split("|")].map((l) => [...l].length)) } as CSSProperties}>
              <span>{t.title}</span>{" "}
              {t.titleAccent.split("|").map((l, i) => (
                <span key={l} className="nw-acc">
                  {i > 0 && " "}
                  {l}
                </span>
              ))}
            </h1>
            <p className="nw-lead">{t.lead}</p>
          </div>
          <dl className="nw-upd" aria-label={t.factsLabel}>
            <div>
              <dt>{t.updated}</dt>
              <dd>
                <Ago iso={news.fetchedAt} locale={lang} />
              </dd>
            </div>
            <div>
              <dt>{t.headlines}</dt>
              <dd>
                <b className="num">{n(news.headlines.length)}</b>
                {news.stats.merged > 0 && <small>{fill(plural(news.stats.merged, lang, t.merged), { n: news.stats.merged })}</small>}
              </dd>
            </div>
            <div>
              <dt>{t.posts}</dt>
              <dd>
                <b className="num">{n(news.posts.length)}</b>
                {news.stats.own > 0 && <small>{fill(t.postsF1, { f1: n(news.stats.f1), own: n(news.stats.own) })}</small>}
              </dd>
            </div>
          </dl>
          {upcoming.length > 0 && <NextRaceLink rounds={upcoming} locale={lang} label={t.nextRace} />}
        </div>
      </section>

      {empty ? (
        <section className="nw-sec">
          <div className="wrap">
            <p className="nw-empty">{t.empty}</p>
          </div>
        </section>
      ) : (
        <>
          <div className="nw-bar">
            <div className="wrap">
              <NewsTabs
                targetId="nw-cols"
                counts={{ all: news.headlines.length + news.posts.length, rss: news.headlines.length, bsky: news.posts.length }}
                labels={{ tabsLabel: t.tabsLabel, tabs: t.tabs }}
              />
              {news.failed.length > 0 && <p className="nw-failed">{fill(t.failed, { list: news.failed.join(", ") })}</p>}
            </div>
          </div>
          <div className="wrap nw-cols" id="nw-cols" data-v="all">
            <section className="nw-col-rss" aria-labelledby="nw-rss-h">
              <h2 className="display" id="nw-rss-h">
                {t.outlets}
              </h2>
              <ol className="nw-list" id="nw-rss">
                {news.headlines.map(headline)}
              </ol>
              <MoreButton listId="nw-rss" pages={hlPages} step={HEADLINES_STEP} total={news.headlines.length} label={t.more} />
            </section>
            <section className="nw-col-bsky" aria-labelledby="nw-bsky-h">
              <h2 className="display" id="nw-bsky-h">
                {t.journalists}
              </h2>
              <ol className="nw-list" id="nw-bsky">
                {news.posts.map(post)}
              </ol>
              <MoreButton listId="nw-bsky" pages={poPages} step={POSTS_STEP} total={news.posts.length} label={t.more} />
            </section>
          </div>
        </>
      )}

      <section className="nw-how" aria-labelledby="nw-how-h">
        <div className="wrap">
          <h2 className="display" id="nw-how-h">
            {t.sources}
          </h2>
          <div className="nw-how-g">
            <div>
              <h3>{t.sourcesRss}</h3>
              <ul>
                {RSS_SOURCES.map((s) => (
                  <li key={s.key}>
                    {s.name} · <span className="nw-url">{s.url}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>{t.sourcesBsky}</h3>
              <p className="nw-handles">
                {BSKY_HANDLES.map((h, i) => (
                  <span key={h}>
                    {i > 0 && " · "}
                    <a href={`https://bsky.app/profile/${h}`} rel="noopener" target="_blank">
                      @{h}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </div>
          <p className="nw-rights">{t.rights}</p>
        </div>
      </section>
    </div>
  );
}
