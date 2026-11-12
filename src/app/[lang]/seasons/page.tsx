import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { DecadeSpy } from "@/components/seasons/decade-spy";
import { SeasonPhoto } from "@/components/seasons/season-photo";
import { PageCredits } from "@/components/teams/page-credits";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getSeasonsIndex, type SeasonCard } from "@/lib/data/seasons";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

// Ширина картки: 280 px у решітці, на телефоні — половина екрана мінус поля (seasons.css).
const SIZES = "(width <= 600px) calc(50vw - 29px), 280px";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return pageMetadata({
    locale: lang,
    path: "/seasons",
    title: dict.nav.seasons,
    description: dict.seasonsPage.metaDescription,
  });
}

export default async function SeasonsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.seasonsPage;
  const data = await getSeasonsIndex(lang);
  const path = (p: string) => localizedPath(p, lang);
  const pl = (v: number, forms: Parameters<typeof plural>[2], extra: Record<string, string | number> = {}) =>
    fill(plural(v, lang, forms), { n: v, ...extra });
  let position = 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: dict.nav.seasons,
    url: new URL(path("/seasons"), siteUrl()).href,
    numberOfItems: data.facts.seasons,
    itemListElement: data.decades
      .flatMap((d) => d.cards)
      .map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.driver ? `${c.year} — ${c.driver.name}` : String(c.year) })),
  };

  const card = (c: SeasonCard, pos: number) => {
    const first = pos === 1;
    const titleId = `season-${c.year}`;
    return (
      <li key={c.year} className={first ? "slot pole" : "slot"} data-pos={`P${pos}`} style={c.color ? ({ "--team": c.color } as CSSProperties) : undefined}>
        <article className="car" aria-labelledby={titleId}>
          {c.photo ? (
            // Готові WebP (як картки команд), без next/image. Перша картка — кандидат LCP.
            <SeasonPhoto
              src={c.photo.src}
              srcSet={c.photo.srcSet}
              sizes={SIZES}
              width={c.photo.width}
              height={c.photo.height}
              priority={first}
              eager={pos <= 4}
              style={c.photo.focus ? { objectPosition: c.photo.focus } : undefined}
            />
          ) : (
            <div className="media ini" aria-hidden="true">
              {c.driver?.initials ?? "—"}
            </div>
          )}
          <h3 id={titleId}>
            <span className="yr num">{c.year}</span>
            <span className="sr-only">: </span>
            {c.driver ? <a href={path(`/drivers/${c.driver.slug}`)}>{c.driver.name}</a> : "—"}
          </h3>
          {c.inProgress && <p className="live">{t.running}</p>}
          <ul className="info" role="list">
            {c.inProgress && c.driver && <li className="lead">{c.decided ? t.champion : t.leader}</li>}
            {c.teams.length > 0 && (
              <li className="tm" translate="no">
                {c.teams.map((tm, i) => (
                  <span key={tm.id}>
                    {i > 0 && ", "}
                    <a href={path(`/teams/${tm.id}`)}>{tm.name}</a>
                  </span>
                ))}
              </li>
            )}
            <li className="st">
              {c.inProgress
                ? `${pl(c.wins, t.winsN)} · ${pl(c.rounds, t.roundsOf, { done: c.races })}`
                : pl(c.wins, t.wins, { races: pl(c.races, t.races) })}
            </li>
            {/* Без Кубка: до 1958 його не було; пізніше — заліку команд ще немає (перша гонка сезону) — рядок не показуємо. */}
            {(c.cup || c.year < 1958) && (
            <li className="cup">
              {c.cup ? (
                <CupText tpl={c.inProgress ? (c.cup.decided ? t.cupDecided : t.cupLeader) : t.cup} name={c.cup.team.name} href={path(`/teams/${c.cup.team.id}`)} />
              ) : (
                t.noCup
              )}
            </li>
            )}
          </ul>
        </article>
      </li>
    );
  };

  return (
    <div className="seasons-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="sn-intro">
        <div className="wrap">
          <div>
            <h1 className="display">{dict.nav.seasons}</h1>
            <p>{t.intro}</p>
          </div>
          <ul className="sn-facts" aria-label={t.factsLabel}>
            <li>
              <b className="num">{data.facts.seasons}</b> <span>{plural(data.facts.seasons, lang, t.facts.seasons)}</span>
            </li>
            <li>
              <b className="num">{data.facts.champions}</b> <span>{plural(data.facts.champions, lang, t.facts.champions)}</span>
            </li>
            <li>
              <b className="num">{data.facts.maxTitles}</b>{" "}
              <span>{fill(plural(data.facts.maxTitles, lang, t.facts.titles), { names: data.facts.maxTitleHolders.join(", ") })}</span>
            </li>
          </ul>
        </div>
      </section>

      <nav className="sn-chips" id="sn-decades" aria-label={t.decades}>
        <div className="wrap">
          {data.decades.map((d) => (
            <a key={d.decade} href={`#d${d.decade}`}>
              {fill(t.decade, { d: d.decade })}
            </a>
          ))}
        </div>
      </nav>
      <DecadeSpy navId="sn-decades" />

      <div className="sn-track">
        <div className="wrap">
          {data.decades.map((d) => (
            // tabindex=-1 — після переходу за якорем фокус потрапляє в розділ (настанова «Scrollspy»).
            <section key={d.decade} className="decade" id={`d${d.decade}`} tabIndex={-1} aria-labelledby={`d${d.decade}-h`}>
              <div className="dec-side">
                <h2 className="display" id={`d${d.decade}-h`}>
                  {fill(t.decade, { d: d.decade })}
                </h2>
                <p>
                  {[
                    pl(d.seasons, t.decadeSeasons),
                    pl(d.champions, t.decadeChampions),
                    d.running ? fill(t.decadeRunning, { year: d.running }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="who">{d.names.join(", ")}</p>
              </div>
              <ol className="grid" role="list">
                {d.cards.map((c) => card(c, ++position))}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <PageCredits groups={[{ title: t.credits, items: data.credits }]} />
    </div>
  );
}

/** «Кубок: {team}» з посиланням на команду замість підстановки. */
function CupText({ tpl, name, href }: { tpl: string; name: string; href: string }) {
  const [before = "", after = ""] = tpl.split("{team}");
  return (
    <>
      {before}
      <a href={href} translate="no">
        {name}
      </a>
      {after}
    </>
  );
}
