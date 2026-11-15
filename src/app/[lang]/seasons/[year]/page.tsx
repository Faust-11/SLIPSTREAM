import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { cache } from "react";
import { TitleChart } from "@/components/season/title-chart";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getSeasonPage, getSeasonYears, type SeasonDriver, type SeasonTeamRef } from "@/lib/data/season-page";
import { seasonPhotoAlt } from "@/lib/image-alt";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; year: string }> };

// 77 сезонів × 2 мови — статично; невідомий рік — 404 без рендеру на запит (правило проєкту, без notFound()).
export const dynamicParams = false;
export async function generateStaticParams() {
  const years = await getSeasonYears();
  return locales.flatMap((lang) => years.map((y) => ({ lang, year: String(y) })));
}

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
};

const pageData = cache(async (year: number, lang: Locale) => {
  const page = await getSeasonPage(year, lang);
  if (!page) throw new Error(`Сезон ${year}: немає в f1.season_index`);
  return page;
});

async function load(props: Props) {
  const { lang: raw, year } = await props.params;
  const lang = requireLocale(raw);
  return { lang, page: await pageData(Number(year), lang), dict: await getDictionary(lang) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, page, dict } = await load(props);
  const t = dict.seasonPage;
  const who = page.champion
    ? fill(page.inProgress && !page.decided ? t.metaLeader : t.metaChampion, { driver: page.champion.name })
    : String(page.year);
  return pageMetadata({
    locale: lang,
    path: `/seasons/${page.year}`,
    title: fill(t.title, { year: page.year }),
    description: fill(t.metaDescription, { year: page.year, who }),
    image: page.hero.photo && page.champion
      ? { src: page.hero.photo.src, alt: seasonPhotoAlt(dict.seasonsPage.photoAlt, page.champion.name, page.year, !page.inProgress || page.decided) }
      : undefined,
  });
}

const slotStyle = (slot: number | null | undefined) => (slot !== null && slot !== undefined ? { "data-slot": slot } : {});

function DriverLink({ d, lang, short = false }: { d: SeasonDriver; lang: Locale; short?: boolean }) {
  return <a href={localizedPath(`/drivers/${d.slug}`, lang)}>{short ? d.short : d.name}</a>;
}
function TeamLink({ tm, lang }: { tm: SeasonTeamRef; lang: Locale }) {
  return (
    <a href={localizedPath(`/teams/${tm.id}`, lang)} translate="no">
      {tm.name}
    </a>
  );
}

export default async function SeasonPage(props: Props) {
  const { lang, page, dict } = await load(props);
  const t = dict.seasonPage;
  const n = (v: number) => fmt[lang].format(v);
  const path = (p: string) => localizedPath(p, lang);
  const pts = (v: number) => fill(plural(v, lang, t.points), { n: n(v) });
  const running = page.inProgress && !page.decided;

  /** Шаблон з підстановками-елементами: «{driver} виграв титул для {team}…». */
  const rich = (tpl: string, parts: Record<string, ReactNode>) =>
    tpl.split(/(\{[a-z0-9]+\})/i).map((s, i) => {
      const m = /^\{([a-z0-9]+)\}$/i.exec(s);
      return m && m[1]! in parts ? <span key={i}>{parts[m[1]!]}</span> : s;
    });
  const joinNodes = (nodes: ReactNode[], sep = ", ") => nodes.flatMap((x, i) => (i ? [sep, x] : [x]));

  /* --- банер --- */
  const champTeam = page.championTeams[0] ?? null;
  const summary: ReactNode[] = [];
  if (page.inProgress) {
    summary.push(fill(t.summary.running, { done: page.races, total: page.rounds }), " ");
    if (page.champion && champTeam)
      summary.push(
        ...rich(page.decided ? t.summary.leaderDecided : t.summary.leader, {
          driver: <DriverLink d={page.champion} lang={lang} />,
          team: <TeamLink tm={champTeam} lang={lang} />,
          margin: <b>{pts(page.keys.margin ?? 0)}</b>,
        }),
      );
  } else if (page.champion) {
    summary.push(
      ...rich(champTeam ? t.summary.champion : t.summary.championNoTeam, {
        driver: <DriverLink d={page.champion} lang={lang} />,
        team: champTeam ? <TeamLink tm={champTeam} lang={lang} /> : null,
        margin: <b>{pts(page.keys.margin ?? 0)}</b>,
      }),
      " ",
    );
    if (!page.cup) summary.push(t.summary.noCup);
    else
      summary.push(
        ...rich(page.cup.team.id === champTeam?.id ? t.summary.cupSame : t.summary.cupOther, { team: <TeamLink tm={page.cup.team} lang={lang} /> }),
      );
  }

  /* --- тексти «Битви за титул» (з даних; ручні абзаци — пізніше, адмінка) --- */
  const f = page.facts;
  const story: ReactNode[][] = [];
  if (f.margin)
    story.push(
      rich(page.inProgress ? t.story.marginRunning : t.story.margin, {
        first: <DriverLink d={f.margin.first} lang={lang} short />,
        second: <DriverLink d={f.margin.second} lang={lang} short />,
        p1: n(page.drivers[0]?.points ?? 0),
        p2: n(page.drivers.find((d) => d.driver.id === f.margin!.second.id)?.points ?? 0),
        gap: <b>{pts(f.margin.points)}</b>,
      }),
    );
  if (f.spells.length === 1) story.push(rich(t.story.spellsOne, { driver: <DriverLink d={f.spells[0]!.driver} lang={lang} short /> }));
  else if (f.spells.length > 1)
    story.push(
      rich(t.story.spells, {
        n: <b>{fill(plural(f.spells.length - 1, lang, t.story.changes), { n: f.spells.length - 1 })}</b>,
        list: joinNodes(
          f.spells.map((s, i) => (
            <span key={i}>
              {rich(s.from === s.to ? t.story.spellOne : t.story.spell, { driver: s.driver.short, from: s.from, to: s.to })}
            </span>
          )),
        ),
      }),
    );
  if (f.deficit) {
    const d = f.deficit;
    // «…і все одно виграв титул» — лише коли титул справді вирішено (у сезоні, що триває, лідер ще не чемпіон).
    const won = d.champion && page.decided;
    const p: ReactNode[] = rich(won ? t.story.deficitChampion : t.story.deficit, {
      round: d.round,
      place: d.place,
      driver: <DriverLink d={d.driver} lang={lang} short />,
      points: <b>{pts(d.points)}</b>,
    });
    // Перемоги після найбільшого відставання — серед гонок, що вже відбулись (у сезоні, що триває, — «відтоді»).
    const races = fill(plural(d.racesAfter, lang, t.story.afterRaces), { n: d.racesAfter });
    if (!won && d.winsAfter > 0)
      p.push(
        " ",
        page.inProgress
          ? fill(t.story.afterRunning, { wins: d.winsAfter, races })
          : d.racesAfter === 1
            ? t.story.afterOne
            : fill(t.story.after, { wins: d.winsAfter, races }),
      );
    story.push(p);
  }
  for (const q of f.disqualified)
    story.push(
      rich(t.story.dsq, {
        place: q.place,
        drivers: <b>{joinNodes(q.drivers.map((d) => <DriverLink key={d.id} d={d} lang={lang} short />), lang === "uk" ? " і " : " and ")}</b>,
        winner: q.winner ? <DriverLink d={q.winner} lang={lang} short /> : "—",
      }),
    );
  if (f.dropped)
    story.push(
      rich(t.story.dropped, {
        rival: <DriverLink d={f.dropped.rival} lang={lang} short />,
        champion: <DriverLink d={f.dropped.champion} lang={lang} short />,
        rt: n(f.dropped.rivalTotal),
        ct: n(f.dropped.championTotal),
        cc: <b>{n(f.dropped.championCounted)}</b>,
        rc: <b>{n(f.dropped.rivalCounted)}</b>,
      }),
    );
  for (const e of f.excluded) story.push(rich(t.story.excluded, { driver: <DriverLink d={e.driver} lang={lang} short />, points: pts(e.points) }));
  if (f.decider) story.push(rich(f.decider.last ? t.story.deciderLast : t.story.decider, { round: f.decider.round, place: f.decider.place }));

  /* --- ключові числа --- */
  const keys: { v: number; label: string; red?: boolean }[] = [
    { v: page.keys.races, label: plural(page.keys.races, lang, t.keys.races) },
    ...(page.keys.sprints > 0 ? [{ v: page.keys.sprints, label: plural(page.keys.sprints, lang, t.keys.sprints) }] : []),
    { v: page.keys.winners, label: plural(page.keys.winners, lang, t.keys.winners) },
    ...(page.keys.margin !== null ? [{ v: page.keys.margin, label: plural(page.keys.margin, lang, t.keys.margin), red: true }] : []),
    ...(page.keys.teamWins
      ? [{ v: page.keys.teamWins.wins, label: fill(plural(page.keys.teamWins.wins, lang, t.keys.teamWinsOne), { team: page.keys.teamWins.team.name, n: page.keys.races }) }]
      : []),
  ];

  const raceDates = page.calendar
    .filter((c) => c.date && !c.cancelled)
    .map((c) => c.date!)
    .sort();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: fill(t.title, { year: page.year }),
    sport: "Formula One",
    url: new URL(path(`/seasons/${page.year}`), siteUrl()).href,
    // Лише етапи, що не скасовані (2026: Саудівська Аравія скасована — сезон закінчується в грудні, а не 19 квітня).
    startDate: raceDates[0],
    endDate: raceDates.at(-1),
    ...(page.hero.photo ? { image: new URL(page.hero.photo.src, siteUrl()).href } : {}),
  };

  const hero = page.hero.photo;
  const style = { "--team": page.hero.color ?? "#8a8f98" } as CSSProperties;

  return (
    <div className="season-page" style={style}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs sp-crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={path("/seasons")}>{t.all}</a>
          <span className="sp" />
          {page.prev && (
            <a className="nb" href={path(`/seasons/${page.prev.year}`)}>
              ‹ {page.prev.year}
            </a>
          )}
          {page.next && (
            <a className="nb" href={path(`/seasons/${page.next.year}`)}>
              {page.next.year} ›
            </a>
          )}
        </div>
      </nav>

      <section className={hero ? "sh has-photo" : "sh"}>
        {hero && (
          // Банер — LCP: без lazy, fetchpriority=high (настанова «Optimize image priority»).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero.src}
            srcSet={hero.srcSet}
            sizes="100vw"
            width={hero.width}
            height={hero.height}
            alt={page.champion ? seasonPhotoAlt(dict.seasonsPage.photoAlt, page.champion.name, page.year, !page.inProgress || page.decided) : ""}
            fetchPriority="high"
            decoding="async"
            style={hero.focus ? { objectPosition: hero.focus } : undefined}
          />
        )}
        <div className="wrap">
          <h1 className="display">{rich(t.title, { year: <span className="yr">{page.year}</span> })}</h1>
          {summary.length > 0 && <p>{summary}</p>}
        </div>
      </section>

      <section className="sk" aria-label={t.keys.label}>
        <ul className="wrap" role="list">
          {keys.map((k) => (
            <li key={k.label} className={k.red ? "red" : undefined}>
              <b className="num">{n(k.v)}</b>
              <span>{k.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {page.chart.lines.length > 0 && (
        <section className="ss fight" aria-labelledby="fight-h">
          <div className="wrap">
            <div className="ss-head">
              <h2 className="display" id="fight-h">
                {t.fight}
              </h2>
              <span className="src">{t.fightSub}</span>
            </div>
            <div className="fight-body">
              {story.length > 0 && (
                <div className="story">
                  {story.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
              <TitleChart
                rounds={page.chart.rounds}
                lines={page.chart.lines}
                leaders={page.chart.leaders}
                label={fill(t.chartLabel, { names: page.chart.lines.map((l) => l.driver.short).join(", ") })}
                roundLabel={(r) => fill(t.round, { n: r })}
                stripLabel={t.leaderStrip}
                tableLabel={t.tableOpen}
                regionLabel={t.fightSub}
                colRound={fill(t.round, { n: "" }).trim()}
                fmt={n}
              />
            </div>
          </div>
        </section>
      )}

      {page.contenders.length > 0 && (
        <section className="ss" aria-labelledby="con-h">
          <div className="wrap">
            <div className="ss-head">
              <h2 className="display" id="con-h">
                {running ? t.contendersRunning : t.contenders}
              </h2>
            </div>
            <ol className="cons" role="list">
              {page.contenders.map((c) => (
                <li key={c.driver.id} className="con" {...slotStyle(c.slot)}>
                  <article aria-labelledby={`con-${c.driver.id}`}>
                    <div className="con-media">
                      {c.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.photo.src}
                          srcSet={c.photo.srcSet}
                          sizes="(width <= 860px) 100vw, 400px"
                          width={c.photo.width}
                          height={c.photo.height}
                          alt={c.driver.name}
                          loading="lazy"
                          decoding="async"
                          style={c.photo.focus ? { objectPosition: c.photo.focus } : undefined}
                        />
                      ) : (
                        <span className="con-ini" aria-hidden="true">
                          {c.number ?? c.driver.initials}
                        </span>
                      )}
                    </div>
                    <div className="con-body">
                      <div className="con-top">
                        <span className="roundel num" aria-hidden="true">
                          {c.number ?? "—"}
                        </span>
                        <div>
                          <span className="place">{(running ? t.placeRunning : t.place)[String(c.position) as "1" | "2" | "3"]}</span>
                          <h3 id={`con-${c.driver.id}`}>
                            <DriverLink d={c.driver} lang={lang} />
                          </h3>
                          {c.team && (
                            <span className="con-team">
                              <TeamLink tm={c.team} lang={lang} />
                            </span>
                          )}
                        </div>
                      </div>
                      <dl className="con-stats">
                        <div>
                          <dt>{plural(c.points, lang, t.stats.points)}</dt>
                          <dd className="num">
                            {n(c.points)}
                            {c.gap > 0 && <small className="gap">{fill(t.stats.gap, { n: n(c.gap) })}</small>}
                          </dd>
                        </div>
                        <div>
                          <dt>{plural(c.wins, lang, t.stats.wins)}</dt>
                          <dd className="num">{n(c.wins)}</dd>
                        </div>
                        <div>
                          <dt>{plural(c.poles, lang, t.stats.poles)}</dt>
                          <dd className="num">{n(c.poles)}</dd>
                        </div>
                        <div>
                          <dt>{plural(c.podiums, lang, t.stats.podiums)}</dt>
                          <dd className="num">{n(c.podiums)}</dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="ss" aria-labelledby="cal-h">
        <div className="wrap">
          <div className="ss-head">
            <h2 className="display" id="cal-h">
              {t.calendar}
            </h2>
            <p className="cal-key">
              {page.keys.sprints > 0 && (
                <span>
                  <span className="tag">S</span> {t.sprintKey}
                </span>
              )}
              <span>{t.calendarKey}</span>
            </p>
          </div>
          <ol className="cal" role="list">
            {page.calendar.map((c) => (
              <li
                key={`${c.round ?? "x"}-${c.gp}`}
                className={["race", c.decider && "decider", !c.done && !c.cancelled && "upcoming", c.cancelled && "cancelled"].filter(Boolean).join(" ")}
                {...slotStyle(c.slot)}
              >
                <div className="race-in">
                  <span className="rhead">
                    <span className="rnum num">{c.round ?? "—"}</span>
                    {c.date && (
                      <time className="rdate" dateTime={c.date}>
                        {dayFmt[lang].format(new Date(`${c.date}T00:00:00Z`))}
                      </time>
                    )}
                    {c.sprint && (
                      <abbr className="tag" title={t.sprintTag}>
                        S
                      </abbr>
                    )}
                  </span>
                  {/* Етап, що відбувся, — посилання на сторінку гонки (фаза 3g); майбутній і скасований — без. */}
                  {c.done && c.round !== null ? (
                    <a className="city" href={path(`/seasons/${page.year}/${c.round}`)}>
                      {c.place}
                    </a>
                  ) : (
                    <span className="city">{c.place}</span>
                  )}
                  <span className="gp">{c.gp}</span>
                  {c.cancelled ? (
                    <span className="note">{t.cancelled}</span>
                  ) : c.done ? (
                    <>
                      <span className="winner">
                        {c.winners.length === 1 && c.winners[0]!.avatar && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="av" src={c.winners[0]!.avatar} width={22} height={22} alt="" loading="lazy" decoding="async" />
                        )}
                        <b>{joinNodes(c.winners.map((w) => <DriverLink key={w.id} d={w} lang={lang} short />), " / ")}</b>
                        {c.winners[0]?.team && <small translate="no">{c.winners[0].team.name}</small>}
                      </span>
                      {c.poles.length > 0 && (
                        // Машина з екіпажем (1950-ті) — через « / », як спільна перемога.
                        <span className="sub">{fill(t.pole, { names: c.poles.map((car) => car.map((p) => p.short).join(" / ")).join(", ") })}</span>
                      )}
                      {c.sprintWinners.length > 0 && (
                        <span className="sub">{fill(t.sprintWin, { names: c.sprintWinners.map((p) => p.short).join(", ") })}</span>
                      )}
                      {c.disqualified.length > 0 && (
                        <span className="note">{fill(t.dsqNote, { names: c.disqualified.map((d) => d.short).join(", ") })}</span>
                      )}
                      {c.half && <span className="note">{t.half}</span>}
                      {/* Чемпіон на ім'я (відгук користувача 14.11: «Титул вирішено» біля переможця гонки плутав). */}
                      {c.decider && page.champion && <span className="note">{fill(t.deciderBy, { name: page.champion.short })}</span>}
                    </>
                  ) : (
                    <span className="sub">{t.upcoming}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ss" aria-labelledby="tab-h">
        <div className="wrap">
          <div className="ss-head">
            <h2 className="display" id="tab-h">
              {page.inProgress ? t.tablesRunning : t.tables}
            </h2>
          </div>
          <div className={page.teams ? "tables" : "tables one"}>
            <table className="st">
              <caption>{t.drivers}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.col.pos}</th>
                  <th scope="col">{t.col.driver}</th>
                  <th scope="col">{t.col.points}</th>
                </tr>
              </thead>
              <tbody>
                {page.drivers.map((r) => (
                  <tr key={r.driver.id} {...slotStyle(r.slot)}>
                    <td className="st-pos num">{r.position ?? "—"}</td>
                    <th scope="row">
                      <span className="st-name">
                        {r.driver.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="av" src={r.driver.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="av av-none" aria-hidden="true" />
                        )}
                        <DriverLink d={r.driver} lang={lang} />
                        {r.team && (
                          <small>
                            <TeamLink tm={r.team} lang={lang} />
                          </small>
                        )}
                        {r.excluded && <em className="st-ex">{t.excludedMark}</em>}
                      </span>
                      <span className="st-bar" aria-hidden="true">
                        <i style={{ inlineSize: `${Math.max(1, (100 * r.points) / Math.max(page.drivers[0]?.points ?? 1, 1))}%` }} />
                      </span>
                    </th>
                    <td className="st-pts num">{n(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {page.teams && (
              <table className="st">
                <caption>{t.teams}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.col.pos}</th>
                    <th scope="col">{t.col.team}</th>
                    <th scope="col">{t.col.points}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.teams.map((r) => (
                    <tr key={r.team.id}>
                      <td className="st-pos num">{r.position ?? "—"}</td>
                      <th scope="row">
                        <span className="st-name">
                          <span className="st-dot" style={{ background: r.team.color ?? "var(--hair)" }} aria-hidden="true" />
                          <TeamLink tm={r.team} lang={lang} />
                          {r.excluded && <em className="st-ex">{t.excludedMark}</em>}
                        </span>
                        <span className="st-bar" aria-hidden="true">
                          <i style={{ inlineSize: `${Math.max(1, (100 * r.points) / Math.max(page.teams![0]?.points ?? 1, 1))}%` }} />
                        </span>
                      </th>
                      <td className="st-pts num">{n(r.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {(page.prev || page.next) && (
        <nav className="nbrs" aria-label={t.neighbours}>
          {[page.prev, page.next].map((nb, i) =>
            nb ? (
              <a key={nb.year} className={i ? "nbr next" : "nbr"} href={path(`/seasons/${nb.year}`)}>
                {nb.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nb.photo.src} srcSet={nb.photo.srcSet} sizes="(width <= 600px) 100vw, 50vw" width={nb.photo.width} height={nb.photo.height} alt="" loading="lazy" decoding="async" />
                )}
                <span className="t">
                  <span>{i ? t.next : t.prev}</span>
                  <b className="num">{nb.year}</b>
                  {nb.champion && <small>{fill(nb.inProgress ? t.nbLeader : t.nbChampion, { name: nb.champion })}</small>}
                </span>
              </a>
            ) : (
              <span key={i} className="nbr empty" aria-hidden="true" />
            ),
          )}
        </nav>
      )}

      <PageCredits groups={[{ title: t.credits, items: page.credits }]} />
    </div>
  );
}
