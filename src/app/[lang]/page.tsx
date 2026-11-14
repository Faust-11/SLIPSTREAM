import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { formatDay, LocalDay, LocalTime, TzNote } from "@/components/calendar/local-time";
import { HmCountdown } from "@/components/home/countdown";
import { HmNews } from "@/components/home/news";
import { HmSlider } from "@/components/home/slider";
import { SeasonPhoto } from "@/components/seasons/season-photo";
import { heroColors } from "@/components/site/section-hero";
import { PageCredits } from "@/components/teams/page-credits";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getHomePage, type RecordList } from "@/lib/data/home";
import type { ResultRow } from "@/lib/data/race-page";
import type { SeasonDriver, SeasonTeamRef } from "@/lib/data/season-page";
import { plural } from "@/lib/plural";
import { gapTime, lapTime, raceTime } from "@/lib/race-math";
import { pageMetadata } from "@/lib/seo";

// Головна статична: збирається з кожним деплоєм після data-sync і бази під час ISR не читає (рішення користувача 14.11 —
// інакше посилання на щойно опубліковану гонку давали б 404, поки йде деплой). Новини — клієнтом з /api/news (ISR 30 хв).

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }),
};
const shortDay = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
};
const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const meta = pageMetadata({ locale: lang, path: "/", title: dict.meta.home.title, description: dict.meta.home.description });
  // Головна — повна назва без шаблону «… · Slipstream».
  return { ...meta, title: { absolute: dict.meta.home.title } };
}

function Driver({ d, lang, small }: { d: SeasonDriver; lang: Locale; small?: boolean }) {
  return (
    <a className="hm-ent" href={localizedPath(`/drivers/${d.slug}`, lang)}>
      {d.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={small ? "hm-av hm-av-s" : "hm-av"} src={d.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className={small ? "hm-av hm-av-s hm-ini" : "hm-av hm-ini"} aria-hidden="true">
          {d.initials}
        </span>
      )}
      <span>{d.name}</span>
    </a>
  );
}
function Team({ t, lang }: { t: SeasonTeamRef | null; lang: Locale }) {
  if (!t) return null;
  return (
    <a className="hm-team" href={localizedPath(`/teams/${t.id}`, lang)} translate="no">
      <i className="hm-sq" style={t.color ? ({ "--c": t.color } as CSSProperties) : undefined} aria-hidden="true" />
      {t.name}
    </a>
  );
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.homePage;
  const rp = dict.racePage;
  const page = await getHomePage(lang);
  const path = (p: string) => localizedPath(p, lang);
  const n = (v: number) => fmt[lang].format(v);
  const { champion, last, next } = page;

  const timeCell = (r: ResultRow): string => {
    if (r.time?.kind === "total") return raceTime(r.time.ms);
    if (r.time?.kind === "gap") return gapTime(r.time.ms);
    if (r.time?.kind === "laps") return fill(plural(r.time.n, lang, rp.lapsDown), { n: r.time.n });
    return rp.status[r.status];
  };

  const recordList = <T,>(title: string, list: RecordList<T>, who: (x: T) => ReactNode, key: (x: T) => string) => (
    <div className="hm-rec">
      <h3>{title}</h3>
      {list.top[0] && (
        <div className="hm-rec-top">
          <b className="num">{n(list.top[0].n)}</b>
          <span className="hm-rec-who">
            {list.top.map((r) => (
              <span key={key(r.who)}>{who(r.who)}</span>
            ))}
          </span>
        </div>
      )}
      <ol className="hm-rec-list">
        {list.rest.map((r) => (
          <li key={key(r.who)}>
            <span className="hm-rec-p num">{r.rank}</span>
            {who(r.who)}
            <span className="hm-rec-v num">{n(r.n)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  const maxPts = Math.max(1, ...page.standings.drivers.map((r) => r.points));
  const maxTeamPts = Math.max(1, ...(page.standings.teams ?? []).map((r) => r.points));
  const lastDone = page.rail.filter((r) => r.state === "done").at(-1);
  const nextRail = page.rail.find((r) => r.state === "next");

  return (
    <div className="hm" data-section="home">
      {/* ---------- герой ---------- */}
      <section className="hm-hero">
        <div className="wrap">
          <div className="hm-hero-main">
            <div className="hm-meta">
              <span>{t.eyebrow}</span>
              <span>
                {page.phase === "running"
                  ? fill(plural(page.total, lang, t.seasonState), { season: page.season, done: page.done, total: page.total })
                  : page.phase === "ahead"
                    ? fill(plural(page.total, lang, t.seasonAhead), { season: page.season, total: page.total })
                    : fill(t.seasonOver, { season: page.season })}
              </span>
            </div>
            <h1 className="display">
              <span>{t.h1[0]}</span>{" "}
              <span className="hm-accent">{t.h1[1]}</span>
            </h1>
            <p className="hm-lede">{fill(t.lede, { first: page.stats.first })}</p>
            <div className="hm-ctas">
              {last && (
                <a className="hm-btn hm-btn-blue" href={path(`/seasons/${last.year}/${last.round}`)}>
                  {fill(t.ctaResults, { gp: last.gp })}
                </a>
              )}
              <a className="hm-btn hm-btn-line" href={path("/game")}>
                {t.ctaGame}
              </a>
            </div>
            <dl className="hm-stats">
              {(
                [
                  [page.stats.seasons, plural(page.stats.seasons, lang, t.stats.seasons)],
                  [page.stats.drivers, plural(page.stats.drivers, lang, t.stats.drivers)],
                  [page.stats.circuits, plural(page.stats.circuits, lang, t.stats.circuits)],
                ] as const
              ).map(([v, l]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd className="num">{n(v)}</dd>
                </div>
              ))}
              <div>
                <dt>{t.stats.first}</dt>
                <dd className="num">{page.stats.first}</dd>
              </div>
            </dl>
          </div>
          {champion && (
            <aside className="hm-champ" aria-labelledby="hm-champ-h">
              <figure className="hm-champ-photo">
                {champion.photo && (
                  <SeasonPhoto
                    src={champion.photo.src}
                    srcSet={champion.photo.srcSet}
                    sizes="(max-width: 1100px) 100vw, 420px"
                    width={champion.photo.width}
                    height={champion.photo.height}
                    priority
                    eager
                    style={champion.photo.focus ? { objectPosition: champion.photo.focus } : undefined}
                  />
                )}
                <span className="hm-stamp hm-stamp-champ" id="hm-champ-h">
                  {fill(champion.decided ? t.champion : t.leader, { season: champion.season })}
                </span>
              </figure>
              <div className="hm-champ-top">
                <span className="hm-roundel" style={champion.team?.color ? ({ "--c": champion.team.color, "--on": heroColors(champion.team.color).fg } as CSSProperties) : undefined} aria-hidden="true">
                  {champion.number ?? champion.driver.initials}
                </span>
                <div>
                  <a className="hm-champ-name" href={path(`/drivers/${champion.driver.slug}`)}>
                    {champion.driver.name}
                  </a>
                  <p>
                    {champion.team && <span translate="no">{champion.team.name}</span>}
                    {champion.team && " · "}
                    {fill(plural(champion.points, lang, t.points), { n: n(champion.points) })} · {fill(plural(champion.wins, lang, t.wins), { n: champion.wins })}
                  </p>
                </div>
              </div>
              {/* Титул вирішено, але етап рішення не визначено однозначно — без підпису (рев'ю PR #25). */}
              {(champion.decider || !champion.decided) && (
                <p className="hm-champ-note">
                  {champion.decider
                    ? champion.decider.left > 0
                      ? fill(plural(champion.decider.left, lang, t.decided), { round: champion.decider.round, place: champion.decider.place, left: champion.decider.left })
                      : fill(t.decidedLast, { place: champion.decider.place })
                    : t.leaderNote}
                </p>
              )}
            </aside>
          )}
        </div>
      </section>

      {/* ---------- смуга сезону ---------- */}
      <section className="hm-rail" aria-labelledby="hm-rail-h">
        <div className="wrap">
          <h2 id="hm-rail-h">
            <a href={path("/calendar")}>{fill(t.railTitle, { season: page.season })}</a>
          </h2>
          <ol className="hm-rail-track" aria-label={fill(t.railLabel, { season: page.season })}>
            {page.rail.map((r) => (
              <li key={r.round} className={`hm-rail-cell hm-rail-${r.state}`} title={`${r.round} · ${r.place}`}>
                <i aria-hidden="true" />
                <span className="num">{r.round}</span>
                <span className="hm-sr">
                  {r.place} — {r.state === "done" ? t.railDone : r.state === "next" ? t.railNextState : t.railLater}
                </span>
              </li>
            ))}
          </ol>
          <div className="hm-rail-key">
            {lastDone && (
              <div>
                <b>{fill(t.railLast, { round: lastDone.round })}</b>
                <span>
                  {lastDone.place}
                  {lastDone.date ? `, ${shortDay[lang].format(utc(lastDone.date))}` : ""}
                </span>
              </div>
            )}
            {nextRail && (
              <div className="hm-rail-key-next">
                <b>{fill(t.railNext, { round: nextRail.round })}</b>
                <span>
                  {nextRail.place}
                  {/* Дата старту — у поясі браузера, як і час старту нижче (календар, PR #19); без часу — дата етапу в UTC. */}
                  {nextRail.raceTimed && nextRail.raceAt ? (
                    <>
                      , <LocalDay iso={nextRail.raceAt} locale={lang} />
                    </>
                  ) : nextRail.date ? (
                    `, ${shortDay[lang].format(utc(nextRail.date))}`
                  ) : (
                    ""
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- остання й наступна гонка ---------- */}
      <section className="hm-races">
        <div className="wrap">
          {last && (
            <article className="hm-last" aria-labelledby="hm-last-h">
              <div className="hm-banner">
                {last.photo && (
                  <SeasonPhoto
                    src={last.photo.src}
                    srcSet={last.photo.srcSet}
                    sizes="(max-width: 1100px) 100vw, 60vw"
                    width={last.photo.width}
                    height={last.photo.height}
                    priority={false}
                    eager={false}
                    style={last.photo.focus ? { objectPosition: last.photo.focus } : undefined}
                  />
                )}
                {last.date && <span className="hm-stamp hm-stamp-fin">{fill(t.lastFinish, { date: dayFmt[lang].format(utc(last.date)) })}</span>}
                <div className="hm-banner-label">
                  <div>
                    <div className="hm-eyebrow">
                      {last.year !== page.season && `${last.year} · `}
                      {fill(t.lastEyebrow, { round: last.round, rounds: last.rounds })}
                    </div>
                    <h2 className="display" id="hm-last-h">
                      <a href={path(`/seasons/${last.year}/${last.round}`)}>{last.gp}</a>
                    </h2>
                  </div>
                  {last.laps !== null && (
                    <span className="hm-chip">
                      {last.place} · {fill(plural(last.laps, lang, t.laps), { n: last.laps })}
                    </span>
                  )}
                </div>
              </div>
              <ol className="hm-podium">
                {last.results.slice(0, 3).map((r) => (
                  <li key={r.driver.id} style={r.driver.team?.color ? ({ "--c": r.driver.team.color } as CSSProperties) : undefined}>
                    <span className="hm-pod-p">P{r.position}</span>
                    <Driver d={r.driver} lang={lang} />
                    <span className="hm-pod-s">
                      <span translate="no">{r.driver.team?.name}</span> · <span className="num">{timeCell(r)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="hm-tbl" role="region" aria-labelledby="hm-last-h" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.col.pos}</th>
                      <th scope="col">{t.col.driver}</th>
                      <th scope="col" className="hm-r hm-c-grid">
                        <abbr title={t.gridTip}>{t.col.grid}</abbr>
                      </th>
                      <th scope="col" className="hm-r">
                        {t.col.gap}
                      </th>
                      <th scope="col" className="hm-r">
                        {t.col.pts}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.results.map((r) => {
                      const delta = r.grid && r.position ? r.grid - r.position : 0;
                      return (
                        <tr key={r.driver.id}>
                          <td className="num hm-pos">{r.position}</td>
                          <th scope="row">
                            <span className="hm-drv">
                              <i className="hm-stripe" style={r.driver.team?.color ? ({ "--c": r.driver.team.color } as CSSProperties) : undefined} aria-hidden="true" />
                              <Driver d={r.driver} lang={lang} small />
                            </span>
                          </th>
                          <td className="hm-r hm-c-grid num">
                            {r.grid || "—"}
                            {delta !== 0 && (
                              <span className={delta > 0 ? "hm-delta hm-up" : "hm-delta hm-dn"}>
                                {delta > 0 ? "▲" : "▼"}
                                {Math.abs(delta)}
                              </span>
                            )}
                          </td>
                          <td className="hm-r num">{timeCell(r)}</td>
                          <td className="hm-r num hm-pts">{r.points ? n(r.points) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="hm-facts">
                {last.pole && (
                  <li>
                    <b>{t.pole}</b>
                    {last.pole.map((d) => d.short).join(" / ")}
                  </li>
                )}
                {last.fastest && (
                  <li>
                    <b>{t.fastest}</b>
                    {last.fastest.driver.short} · <span className="num">{lapTime(last.fastest.ms)}</span>
                  </li>
                )}
                {last.climb && (
                  <li>
                    <b>{t.climb}</b>
                    {last.climb.driver.short} · {fill(t.climbText, { grid: last.climb.grid, finish: last.climb.finish })}
                  </li>
                )}
              </ul>
              <p className="hm-more-row">
                <a className="hm-more" href={path(`/seasons/${last.year}/${last.round}`)}>
                  {t.allResults}
                </a>
                <a className="hm-more" href={path("/calendar")}>
                  {t.calendarLink}
                </a>
              </p>
            </article>
          )}

          <article className="hm-next" aria-labelledby="hm-next-h">
            {next ? (
              <>
                <div className="hm-banner hm-banner-next">
                  {next.circuit?.photo && (
                    <SeasonPhoto
                      src={next.circuit.photo.src}
                      srcSet={next.circuit.photo.srcSet}
                      sizes="(max-width: 1100px) 100vw, 40vw"
                      width={next.circuit.photo.width}
                      height={next.circuit.photo.height}
                      priority={false}
                      eager={false}
                      style={{ objectPosition: next.circuit.photo.focus }}
                    />
                  )}
                  <div className="hm-banner-label">
                    <div>
                      <div className="hm-eyebrow">{fill(t.nextEyebrow, { round: next.round, rounds: next.rounds })}</div>
                      <h2 className="display" id="hm-next-h">
                        <a href={path(`/calendar#r${next.round}`)}>{next.gp}</a>
                      </h2>
                    </div>
                  </div>
                  <span className="hm-roundel hm-roundel-next" aria-hidden="true">
                    {next.round}
                  </span>
                </div>
                <div className="hm-next-body">
                  {next.raceAt && (
                    <div className="hm-when">
                      <strong>{next.place}</strong>
                      <span>
                        {t.raceStart}:{" "}
                        {/* Без справжнього часу raceAt — кінець дня за UTC: дату беремо з етапу в UTC, а не в поясі браузера
                            (на схід від UTC вона з'їжджала б на день уперед; рев'ю PR #25, як у календарі). */}
                        {next.raceTimed ? <LocalTime iso={next.raceAt} locale={lang} /> : formatDay(next.date ?? next.raceAt, lang, "UTC")}
                      </span>
                      {next.raceTimed && <TzNote utc={dict.calendarPage.tzUtc} local={dict.calendarPage.tzLocal} />}
                    </div>
                  )}
                  {page.upcoming.length > 0 && (
                    <HmCountdown
                      rounds={page.upcoming}
                      shown={next.round}
                      labels={{
                        label: dict.calendarPage.countdownLabel,
                        days: dict.calendarPage.days,
                        hours: dict.calendarPage.hours,
                        minutes: dict.calendarPage.minutes,
                        started: fill(dict.calendarPage.raceStarted, { round: next.round }),
                        then: t.countdownThen,
                      }}
                    />
                  )}
                  {next.circuit?.layout && (
                    <figure className="hm-map">
                      <figcaption>{t.mapHead}</figcaption>
                      <svg viewBox={`-40 -40 ${next.circuit.layout.w + 80} ${next.circuit.layout.h + 80}`} role="img" aria-label={next.circuit.name}>
                        <path className="hm-map-casing" d={next.circuit.layout.d} />
                        <path className="hm-map-line" d={next.circuit.layout.d} />
                      </svg>
                    </figure>
                  )}
                  {next.circuit && (next.circuit.lengthKm || next.circuit.turns || next.circuit.laps) && (
                    <dl className="hm-spec">
                      {next.circuit.lengthKm && (
                        <div>
                          <dt>{t.km}</dt>
                          <dd className="num">{new Intl.NumberFormat(lang, { minimumFractionDigits: 3 }).format(next.circuit.lengthKm)}</dd>
                        </div>
                      )}
                      {next.circuit.turns && (
                        <div>
                          <dt>{t.turns}</dt>
                          <dd className="num">{next.circuit.turns}</dd>
                        </div>
                      )}
                      {next.circuit.laps && (
                        <div>
                          <dt>{t.raceLaps}</dt>
                          <dd className="num">{next.circuit.laps}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {next.circuit && next.circuit.winners.length > 0 && (
                    <p className="hm-past">
                      <b>{t.pastWinners}</b>
                      <span>
                        {next.circuit.winners.map((w, i) => (
                          <span key={`${w.year}-${w.round}`}>
                            {i > 0 && " · "}
                            <a href={path(`/seasons/${w.year}/${w.round}`)}>{w.year}</a> {w.drivers.map((d) => d.short).join(" / ")}
                          </span>
                        ))}
                      </span>
                    </p>
                  )}
                  {next.circuit && (
                    <a className="hm-more" href={path(`/circuits/${next.circuit.slug}`)}>
                      {t.circuitLink}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="hm-next-body hm-over">
                <h2 className="display" id="hm-next-h">
                  {fill(t.seasonOver, { season: page.season })}
                </h2>
                <p>{t.seasonOverNext}</p>
                <a className="hm-more" href={path(`/seasons/${page.season}`)}>
                  {fill(t.seasonLink, { season: page.season })}
                </a>
              </div>
            )}
          </article>
        </div>
      </section>

      {/* ---------- чемпіонат і рекорди ---------- */}
      <section className="hm-champs">
        <div className="wrap">
          <div className="hm-standings">
            <div className="hm-head">
              <h2 className="display">{t.standings}</h2>
              <span className="hm-src">
                {page.standings.final ? fill(t.finalStandings, { season: page.standings.season }) : fill(t.afterRound, { round: page.standings.afterRound })}
              </span>
            </div>
            <HmSlider id="hm-st" label={t.tabsLabel} tabs={page.standings.teams ? [t.tabDrivers, t.tabTeams] : [t.tabDrivers]}>
              <ol className="hm-panel" id="hm-st-0" aria-label={t.tabDrivers}>
                {page.standings.drivers.map((r) => (
                  <li key={r.driver.id} className="hm-st-row">
                    <span className="hm-st-pos num">{r.position ?? "—"}</span>
                    <span className="hm-st-name">
                      <Driver d={r.driver} lang={lang} small />
                      <Team t={r.team} lang={lang} />
                      <span className="hm-bar" aria-hidden="true">
                        <i style={{ inlineSize: `${(100 * r.points) / maxPts}%` }} />
                      </span>
                    </span>
                    <span className="hm-st-pts num">{n(r.points)}</span>
                  </li>
                ))}
              </ol>
              {page.standings.teams && (
                <ol className="hm-panel" id="hm-st-1" aria-label={t.tabTeams}>
                  {page.standings.teams.map((r) => (
                    <li key={r.team.id} className="hm-st-row">
                      <span className="hm-st-pos num">{r.position ?? "—"}</span>
                      <span className="hm-st-name">
                        <Team t={r.team} lang={lang} />
                        <span className="hm-bar" aria-hidden="true">
                          <i style={{ inlineSize: `${(100 * r.points) / maxTeamPts}%` }} />
                        </span>
                      </span>
                      <span className="hm-st-pts num">{n(r.points)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </HmSlider>
            <a className="hm-more" href={path(`/seasons/${page.standings.season}`)}>
              {t.fullStandings}
            </a>
          </div>
          <div className="hm-records" data-surface="dark">
            <div className="hm-head">
              <h2 className="display">{t.records}</h2>
              <span className="hm-src">{fill(t.recordsSince, { first: page.stats.first })}</span>
            </div>
            <div className="hm-rec-grid">
              {recordList(t.recWins, page.records.wins, (d) => <Driver d={d} lang={lang} small />, (d) => d.id)}
              {recordList(t.recTitles, page.records.titles, (d) => <Driver d={d} lang={lang} small />, (d) => d.id)}
              {recordList(
                t.recCups,
                page.records.cups,
                (x) => (
                  <a className="hm-ent" href={path(`/teams/${x.id}`)} translate="no">
                    <span>{x.name}</span>
                  </a>
                ),
                (x) => x.id,
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- новини ---------- */}
      <section className="hm-news" aria-labelledby="hm-news-h">
        <div className="wrap">
          <div className="hm-head">
            <h2 className="display" id="hm-news-h">
              {t.news}
            </h2>
            <a className="hm-more" href={path("/news")}>
              {t.allNews}
            </a>
          </div>
          <HmNews
            locale={lang}
            labels={{
              tabs: t.newsTabs,
              headlines: t.tabHeadlines,
              posts: t.tabPosts,
              loading: t.newsLoading,
              empty: t.newsEmpty,
              post: dict.newsPage.openBskyAuthor,
              sources: { f1: "Formula 1", motorsport: "Motorsport.com", autosport: "Autosport" },
            }}
          />
        </div>
      </section>

      <PageCredits
        groups={[
          { title: t.creditsPhotos, items: page.credits.photos },
          { title: t.creditsPortraits, items: page.credits.portraits },
        ]}
      />
    </div>
  );
}
