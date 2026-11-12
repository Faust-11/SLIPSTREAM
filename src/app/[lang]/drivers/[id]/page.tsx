import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { cache } from "react";
import { SeasonBars } from "@/components/driver/season-bars";
import { WinsList } from "@/components/driver/wins-list";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getDriverPage, getDriverSlugs, type DriverPage, type Milestone, type TeamRef } from "@/lib/data/driver-page";
import { ukOrdinal } from "@/lib/ordinal";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; id: string }> };
type Dict = Awaited<ReturnType<typeof getDictionary>>["driver"];

// 793 пілоти × 2 мови — статично; невідомий slug — 404 без рендеру на запит.
export const dynamicParams = false;
export async function generateStaticParams() {
  const slugs = await getDriverSlugs();
  return locales.flatMap((lang) => slugs.map((id) => ({ lang, id })));
}

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dateFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};
/** Скільки напарників показуємо одразу; решта — у згорнутому переліку (у пілотів 1950–70-х їх до 27). */
const MATES_SHOWN = 8;

// Метадані й сторінка беруть ті самі дані: cache() — один розрахунок на маршрут.
const pageData = cache(async (slug: string, lang: Locale) => {
  const page = await getDriverPage(slug, lang);
  // Невідомий slug сюди не доходить (dynamicParams = false — правило проєкту, без notFound()).
  if (!page) throw new Error(`Пілот ${slug}: немає в f1.driver_index`);
  return page;
});

async function load(props: Props) {
  const { lang: raw, id } = await props.params;
  const lang = requireLocale(raw);
  return { lang, page: await pageData(id, lang), dict: await getDictionary(lang) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, page, dict } = await load(props);
  const t = dict.driver;
  const n = (v: number) => fmt[lang].format(v);
  const { totals } = page;
  const starts = fill(plural(totals.starts, lang, t.startsN), { n: n(totals.starts) });
  const first = page.seasons[0]!.year;
  const last = page.seasons[page.seasons.length - 1]!.year;
  return pageMetadata({
    locale: lang,
    path: `/drivers/${page.slug}`,
    title: page.name,
    description:
      totals.wins > 0
        ? fill(t.metaDescription, {
            name: page.name,
            // «0 титулів» не пишемо: лише те, що є.
            facts: [starts, fill(plural(totals.wins, lang, t.winsN), { n: n(totals.wins) })]
              .concat(totals.titles > 0 ? [fill(plural(totals.titles, lang, t.titlesN), { n: n(totals.titles) })] : [])
              .join(", "),
          })
        : fill(t.metaDescriptionShort, { name: page.name, starts, years: first === last ? first : `${first}–${last}` }),
  });
}

function TeamLink({ team, lang, dot = false }: { team: TeamRef; lang: Locale; dot?: boolean }) {
  return (
    <a className="tl" href={localizedPath(`/teams/${team.id}`, lang)} translate="no">
      {dot && <i className="tdot" style={team.color ? { background: team.color } : undefined} aria-hidden="true" />}
      {team.name}
    </a>
  );
}

function milestoneText(m: Milestone, t: Dict, lang: Locale): { title: string; detail: string } {
  switch (m.kind) {
    case "debut":
      return { title: t.miles.debut, detail: m.gp };
    case "firstPodium":
      return { title: t.miles.firstPodium, detail: `${m.gp} · P${m.position}` };
    case "firstPole":
      return { title: t.miles.firstPole, detail: m.gp };
    case "firstWin":
      return { title: t.miles.firstWin, detail: m.grid ? `${m.gp} · ${fill(t.wins.grid, { n: m.grid })}` : m.gp };
    case "titles":
      return {
        title: m.years.length === 1 ? t.miles.champion : fill(plural(m.years.length, lang, t.miles.titles), { n: m.years.length }),
        detail: m.years.join(", "),
      };
  }
}

export default async function DriverPageView(props: Props) {
  const { lang, page, dict } = await load(props);
  const t = dict.driver;
  const n = (v: number) => fmt[lang].format(v);
  const date = (iso: string) => dateFmt[lang].format(new Date(`${iso}T00:00:00Z`));
  const pl = (v: number, forms: Parameters<typeof plural>[2]) => fill(plural(v, lang, forms), { n: n(v) });
  const { totals, current } = page;
  const path = (p: string) => localizedPath(p, lang);

  const strip = [
    { v: totals.starts, f: t.totals.starts, show: true },
    { v: totals.wins, f: t.totals.wins, show: totals.wins > 0 },
    { v: totals.podiums, f: t.totals.podiums, show: totals.podiums > 0 },
    { v: totals.poles, f: t.totals.poles, show: totals.poles > 0 },
    { v: totals.fastestLaps ?? 0, f: t.totals.fastestLaps, show: totals.fastestLaps !== null && totals.fastestLaps > 0 },
    { v: totals.points, f: t.totals.points, show: totals.points > 0 },
    { v: totals.titles, f: t.totals.titles, show: totals.titles > 0 },
  ].filter((x) => x.show);

  const place = (s: DriverPage["seasons"][number]) => (s.excluded ? t.seasons.excluded : s.position ? `P${s.position}` : "—");
  const bars = page.seasons.map((s) => {
    const main = [...s.teams].sort((a, b) => b.races - a.races)[0]!;
    return {
      year: s.year,
      points: s.points,
      pointsText: s.points !== null ? n(s.points) : null,
      place: place(s),
      color: main.color,
      champion: s.champion,
      title: [s.year, place(s), s.points !== null ? pl(s.points, t.points) : null, s.teams.map((x) => x.name).join(", ")]
        .filter(Boolean)
        .join(" · "),
    };
  });
  const hasChart = bars.length >= 2 && bars.some((b) => (b.points ?? 0) > 0);

  const single = page.stints.length === 1 ? page.stints[0]! : null;
  const numbers = page.numbers
    .map((p) => (p.from === p.to ? fill(t.facts.numberOne, { n: p.n, year: p.from }) : fill(t.facts.numberRange, { n: p.n, from: p.from, to: p.to })))
    .join(", ");
  const carNumber = page.carNumber;

  const maxByGp = page.wins.byGrandPrix[0]?.count ?? 1;
  const matesTop =
    page.teammates.length > MATES_SHOWN
      ? [...page.teammates].sort((a, b) => b.races - a.races).slice(0, MATES_SHOWN).sort((a, b) => page.teammates.indexOf(a) - page.teammates.indexOf(b))
      : page.teammates;
  const matesRest = page.teammates.filter((m) => !matesTop.includes(m));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: page.name,
    ...(page.name !== page.latin ? { alternateName: page.latin } : {}),
    jobTitle: t.jobTitle,
    url: new URL(path(`/drivers/${page.slug}`), siteUrl()).href,
    ...(page.born ? { birthDate: page.born } : {}),
    ...(page.died ? { deathDate: page.died } : {}),
    ...(page.country ? { nationality: page.country } : {}),
    ...(page.portrait ? { image: new URL(page.portrait.src, siteUrl()).href } : {}),
    ...(page.instagram ? { sameAs: [`https://www.instagram.com/${page.instagram}/`] } : {}),
  };
  // Колір команди — лише в учасників поточного сезону; в інших акцент нейтральний (як на сторінці команди).
  const style = { "--team": page.color ?? "var(--ink)" } as CSSProperties;

  const mateRow = (m: DriverPage["teammates"][number]) => {
    const rows = [
      { label: t.mates.races, a: m.ahead, b: m.behind },
      ...(m.quali ? [{ label: t.mates.quali, a: m.quali.ahead, b: m.quali.behind }] : []),
    ];
    return (
      <li key={`${m.team.id}|${m.mate.id}`} className="mt">
        <span className="mt-y">
          <span className="num">{m.years}</span>
          <TeamLink team={m.team} lang={lang} />
        </span>
        <dl className="hbars">
          {rows.map((r) => (
            <div key={r.label} className="hb">
              <dt className="hl">{r.label}</dt>
              <dd>
                <span className="sr-only">{fill(t.mates.sr, { a: page.name, x: n(r.a), b: m.mate.name, y: n(r.b) })}</span>
                <b className="hn num" aria-hidden="true">
                  {n(r.a)}
                </b>
                <span className="hbar" aria-hidden="true">
                  <i style={{ width: `${(r.a / Math.max(r.a + r.b, 1)) * 100}%` }} />
                </span>
                <b className="hn num" aria-hidden="true">
                  {n(r.b)}
                </b>
              </dd>
            </div>
          ))}
        </dl>
        <a className="ent" href={path(`/drivers/${m.mate.slug}`)}>
          {m.mate.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="av" src={m.mate.avatar} width={32} height={32} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="av av-ini" aria-hidden="true">
              {m.mate.initials}
            </span>
          )}
          <span>{m.mate.name}</span>
        </a>
      </li>
    );
  };

  return (
    <div className="team-page driver-page" style={style}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={path("/drivers")}>{t.crumbs}</a>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{page.name}</span>
        </div>
      </nav>

      <section className={page.portrait ? "dh" : "dh no-photo"}>
        <div className="wrap">
          {page.portrait ? (
            // Вузьке джерело (портрет < 420 px) не розтягуємо — ширина не більша за сам файл.
            <figure className="dh-photo" style={{ maxWidth: page.portrait.maxWidth }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.portrait.src}
                srcSet={page.portrait.srcSet}
                sizes="(width <= 860px) min(340px, calc(100vw - 32px)), 420px"
                width={page.portrait.width}
                height={page.portrait.height}
                alt={page.name}
                fetchPriority="high"
                decoding="async"
              />
              {carNumber !== null && (
                <span className="dh-num num" role="img" aria-label={fill(t.numberLabel, { n: carNumber })}>
                  {carNumber}
                </span>
              )}
            </figure>
          ) : page.avatar ? (
            // Великого портрета немає (вузьке джерело або ще не зібрано) — малий, той самий, що в списку.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dh-ini" src={page.avatar} width={96} height={96} alt={page.name} decoding="async" />
          ) : (
            <div className="dh-ini" aria-hidden="true">
              {page.initials}
            </div>
          )}
          <div className="dh-id">
            {totals.titles > 0 && (
              <span className="th-stamp">
                {fill(totals.titles === 1 ? t.stamp.one : t.stamp.many, { n: totals.titles, years: totals.titleYears.join(", ") })}
              </span>
            )}
            <h1 className="display">
              {page.nameParts[0] && <span>{page.nameParts[0]} </span>}
              <span className="sn">{page.nameParts[1]}</span>
            </h1>
            {page.instagram && (
              <a className="dh-ig" href={`https://www.instagram.com/${encodeURIComponent(page.instagram)}/`} rel="noopener">
                {t.instagram} <small>@{page.instagram}</small>
              </a>
            )}
            <dl className="dh-facts" aria-label={t.facts.label}>
              {page.country && (
                <div>
                  <dt>{t.facts.country}</dt>
                  <dd>{page.country}</dd>
                </div>
              )}
              {page.born && (
                <div>
                  <dt>{page.died ? t.facts.lived : t.facts.born}</dt>
                  <dd>
                    {page.died
                      ? `${date(page.born)} — ${date(page.died)}`
                      : page.age !== null
                        ? fill(t.facts.bornAge, { date: date(page.born), age: pl(page.age, t.age) })
                        : date(page.born)}
                  </dd>
                </div>
              )}
              <div>
                <dt>{single ? t.facts.team : t.facts.teams}</dt>
                <dd className="dh-teams">
                  {single ? (
                    <span>
                      <TeamLink team={{ id: single.team, name: single.name, color: null }} lang={lang} />
                      {page.seasons.length > 1 && ` · ${pl(page.seasons.length, t.facts.allSeasons)}`}
                    </span>
                  ) : (
                    page.stints.map((s, i) => (
                      <span key={`${s.team}-${s.from}`}>
                        <TeamLink team={{ id: s.team, name: s.name, color: null }} lang={lang} />{" "}
                        <span className="num">{s.from === s.to ? s.from : `${s.from}–${s.to}`}</span>
                        {i < page.stints.length - 1 ? "," : ""}
                      </span>
                    ))
                  )}
                </dd>
              </div>
              {numbers && (
                <div>
                  <dt>{t.facts.number}</dt>
                  <dd>{numbers}</dd>
                </div>
              )}
              <div>
                <dt>{t.facts.debut}</dt>
                <dd>
                  {page.debut.gp} {page.debut.year}
                </dd>
              </div>
              {current ? (
                <div>
                  <dt>{fill(t.facts.now, { year: current.year })}</dt>
                  <dd>
                    {[
                      current.position ? fill(t.facts.nowPlace, { pos: lang === "uk" ? ukOrdinal(current.position) : current.position }) : null,
                      pl(current.points, t.points),
                      pl(current.wins, t.winsN),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt>{t.facts.last}</dt>
                  <dd>
                    {page.last.gp} {page.last.year}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </section>

      <section className="ts" aria-label={t.totals.label}>
        <div className="wrap">
          {strip.map((s, i) => (
            <div key={i}>
              <b className="num">{n(s.v)}</b>
              <span>{plural(s.v, lang, s.f)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" aria-labelledby="s-seasons">
        <div className="wrap">
          <div className="sec-head">
            <h2 className="display" id="s-seasons">
              {t.seasons.title}
            </h2>
            <span className="src">{t.seasons.note}</span>
          </div>
          {/* Довга кар'єра (понад 12 сезонів) — графік на всю ширину над таблицею: у вузькій колонці підписи були б 6–7 px. */}
          <div className={hasChart ? (bars.length > 12 ? "ds stacked" : "ds") : "ds no-chart"}>
            {hasChart && (
              <div>
                {/* На вузькому екрані графік прокручується вбік — область доступна з клавіатури (axe scrollable-region-focusable). */}
                <div className="pos-scroll" role="region" aria-label={t.seasons.chartLabel} tabIndex={0}>
                  <SeasonBars bars={bars} label={t.seasons.chartLabel} />
                </div>
                {totals.titles > 0 && (
                  <p className="pkey">
                    <span>
                      <i className="win" />
                      {t.seasons.keyChampion}
                    </span>
                  </p>
                )}
              </div>
            )}
            {/* Назва області — наявний заголовок розділу (а не копія рядка): настанова «Responsive tables». */}
            <div className="tscroll ds-table" role="region" aria-labelledby="s-seasons" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.seasons.year}</th>
                    <th scope="col">{t.seasons.team}</th>
                    <th scope="col" className="r c-xs">
                      {t.seasons.races}
                    </th>
                    <th scope="col" className="r">
                      {t.seasons.wins}
                    </th>
                    <th scope="col" className="r c-hide">
                      {t.seasons.podiums}
                    </th>
                    <th scope="col" className="r c-hide">
                      {t.seasons.poles}
                    </th>
                    <th scope="col" className="r">
                      {t.seasons.points}
                    </th>
                    <th scope="col" className="r">
                      {t.seasons.place}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.seasons.map((s) => (
                    <tr key={s.year} className={s.champion ? "champ" : undefined}>
                      <th scope="row" className="yr num">
                        {s.year}
                      </th>
                      <td className="ds-teams">
                        {s.teams.map((tm) => (
                          <TeamLink key={tm.id} team={tm} lang={lang} dot />
                        ))}
                      </td>
                      <td className="r num c-xs">{n(s.races)}</td>
                      <td className="r num">{n(s.wins)}</td>
                      <td className="r num c-hide">{n(s.podiums)}</td>
                      <td className="r num c-hide">{n(s.poles)}</td>
                      <td className="r num">{s.points !== null ? n(s.points) : "—"}</td>
                      <td className="r ps num">
                        {s.excluded ? (
                          <abbr title={t.seasons.excludedTitle}>{t.seasons.excluded}</abbr>
                        ) : s.position ? (
                          <>
                            P{s.position}
                            {s.in_progress && <span className="live">{t.seasons.running}</span>}
                          </>
                        ) : (
                          <span title={t.seasons.noPlace}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {page.teammates.length > 0 && (
        <section className="sec" aria-labelledby="s-mates">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="display" id="s-mates">
                {t.mates.title}
              </h2>
            </div>
            <ul className="mates">{matesTop.map(mateRow)}</ul>
            {matesRest.length > 0 && (
              <details className="more">
                <summary>{fill(t.mates.showAll, { n: matesRest.length })}</summary>
                <ul className="mates">{matesRest.map(mateRow)}</ul>
              </details>
            )}
            <p className="pkey mates-key">
              <span>
                <i className="team" />
                {fill(t.mates.keyAhead, { name: page.nameParts[1] })}
              </span>
              <span>
                <i className="mate" />
                {t.mates.keyBehind}
              </span>
              <span>{t.mates.note}</span>
            </p>
          </div>
        </section>
      )}

      {page.wins.list.length > 0 && (
        <section className="sec" aria-labelledby="s-wins">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="display" id="s-wins">
                {pl(totals.wins, t.wins.title)}
              </h2>
            </div>
            <div className="wtop dw">
              <ul className="wfeat">
                {page.wins.featured.map((f) => (
                  <li key={f.kind} style={f.win.team.color ? ({ "--team": f.win.team.color } as CSSProperties) : undefined}>
                    <span className="wl">
                      {f.kind === "first" ? t.wins.first : f.kind === "latest" ? t.wins.latest : fill(t.wins.fromGrid, { n: f.win.grid! })}
                    </span>
                    <span className="wy num">{f.win.year}</span>
                    <b>{f.win.name}</b>
                    <span className="wg">
                      <span translate="no">{f.win.team.name}</span>
                      {f.win.grid ? ` · ${fill(t.wins.grid, { n: f.win.grid })}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {page.wins.byGrandPrix.length > 1 && (
                <div>
                  <h3 className="lab">{t.wins.byGrandPrix}</h3>
                  <ol className="bars">
                    {page.wins.byGrandPrix.slice(0, 8).map((g) => (
                      <li key={g.name}>
                        <span className="gp">{g.name}</span>
                        <span className="bar" aria-hidden="true">
                          <i style={{ width: `${(g.count / maxByGp) * 100}%` }} />
                        </span>
                        <b className="num">{n(g.count)}</b>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            {/* Перелік — щойно в ньому є перемоги, яких немає серед виділених (у пілота з 3 перемогами середня інакше зникала б). */}
            {page.wins.list.length > page.wins.featured.length && (
              <details className="more">
                <summary>{fill(t.wins.showAll, { n: n(page.wins.list.length) })}</summary>
                <WinsList
                  wins={[...page.wins.list]
                    .reverse()
                    .map((w) => [
                      w.n,
                      [date(w.date), w.name, w.team.name, w.grid ? fill(t.wins.grid, { n: w.grid }) : null].filter(Boolean).join(" · "),
                      w.team.id,
                    ])}
                  teams={page.wins.byTeam.map(({ id, name, count }) => ({ id, name, count }))}
                  labels={{ filterLabel: t.wins.filterLabel, all: t.wins.filterAll, listLabel: t.wins.listLabel }}
                />
              </details>
            )}
          </div>
        </section>
      )}

      {page.milestones.length > 1 && (
        <section className="sec" aria-labelledby="s-miles">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="display" id="s-miles">
                {t.miles.title}
              </h2>
            </div>
            <ol className="miles" style={{ "--n": page.milestones.length } as CSSProperties}>
              {page.milestones.map((m) => {
                const x = milestoneText(m, t, lang);
                return (
                  <li key={m.kind} className={m.kind === "titles" ? "gold" : undefined}>
                    <span className="my num">{m.year}</span>
                    <div>
                      <b>{x.title}</b>
                      <span>{x.detail}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      <PageCredits groups={[{ title: t.credits.portraits, items: page.credits }]} />
    </div>
  );
}
