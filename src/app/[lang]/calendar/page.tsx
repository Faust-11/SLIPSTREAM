import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { LiveRounds } from "@/components/calendar/live-rounds";
import { LocalDay, LocalTime } from "@/components/calendar/local-time";
import { NextRace, type UpcomingRound } from "@/components/calendar/next-race";
import { RoundsFilter, type CalendarFilter } from "@/components/calendar/rounds-filter";
import { PageCredits } from "@/components/teams/page-credits";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { CALENDAR_DRIVERS_TOP, getCalendarPage, type CalendarCard, type CalendarSession } from "@/lib/data/calendar";
import { driverPortrait } from "@/lib/data/drivers";
import type { SeasonDriver, SeasonTeamRef } from "@/lib/data/season-page";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbList } from "@/lib/jsonld";
import { LazyWeekendWeather } from "@/components/weather/lazy-weather";
import { weekendLabels } from "@/components/weather/labels";
import { sessionsFromCalendar, WEATHER_FROM_YEAR, type SessionKind } from "@/lib/weather";

type Props = { params: Promise<{ lang: string }> };

const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
};
const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const page = await getCalendarPage(lang);
  return pageMetadata({
    locale: lang,
    path: "/calendar",
    title: `${dict.calendarPage.title} ${page.season}`,
    description: fill(plural(page.total, lang, dict.calendarPage.metaDescription), { season: page.season, n: page.total }),
  });
}

function sessionLabel(kind: CalendarSession["kind"], s: Record<string, string>): string {
  if (kind === "Q1" || kind === "QB" || kind === "QA") return s.Q!;
  if (kind === "SQ1") return s.SQ!;
  return s[kind] ?? kind;
}

function Driver({ d, lang }: { d: SeasonDriver; lang: Locale }) {
  return (
    <a className="cl-ent" href={localizedPath(`/drivers/${d.slug}`, lang)}>
      {d.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cl-av" src={d.avatar} width={26} height={26} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="cl-av cl-ini" aria-hidden="true">
          {d.initials}
        </span>
      )}
      <span>{d.short}</span>
    </a>
  );
}
function Team({ t, lang }: { t: SeasonTeamRef; lang: Locale }) {
  return (
    <a className="cl-team" href={localizedPath(`/teams/${t.id}`, lang)} translate="no">
      <i className="cl-sq" style={t.color ? ({ "--c": t.color } as CSSProperties) : undefined} aria-hidden="true" />
      {t.name}
    </a>
  );
}

export default async function CalendarPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.calendarPage;
  const sessionNames = dict.racePage.session as Record<string, string>;
  const page = await getCalendarPage(lang);
  const path = (p: string) => localizedPath(p, lang);
  const n = (v: number) => fmt[lang].format(v);
  const nextCard = page.cards.find((c) => c.state === "next") ?? null;
  const upcoming: UpcomingRound[] = page.cards
    .filter((c) => c.state !== "done" && c.raceAt)
    .map((c) => ({
      round: c.round,
      gp: c.gp,
      place: c.place,
      raceAt: c.raceAt!,
      sessions: c.sessions.filter((s) => s.at).map((s) => ({ label: sessionLabel(s.kind, sessionNames), at: s.at!, race: s.kind === "R", real: s.real })),
    }));
  const counts: Record<CalendarFilter, number> = {
    all: page.cards.length,
    ahead: page.cards.filter((c) => c.state !== "done").length,
    done: page.cards.filter((c) => c.state === "done").length,
    sprint: page.cards.filter((c) => c.sprint).length,
  };
  const shownDrivers = [
    ...page.cards.flatMap((c) => [...c.winners, ...c.poles.flat(), ...c.sprintWinners]),
    ...page.drivers.slice(0, CALENDAR_DRIVERS_TOP).map((r) => r.driver),
    ...(page.champion ? [page.champion] : []),
  ];
  const seen = new Set<string>();
  const credits = shownDrivers.flatMap((d) => {
    const p = d.avatar && !seen.has(d.id) ? driverPortrait(d.id) : null;
    if (!p) return [];
    seen.add(d.id);
    return [{ label: d.name, href: p.credit.page, author: p.credit.author, license: p.credit.license }];
  });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    name: `Formula 1 ${page.season}`,
    url: new URL(path("/calendar"), siteUrl()).href,
    subEvent: page.cards.map((c) => ({
      "@type": "SportsEvent",
      name: `${c.gp} ${page.season}`,
      startDate: c.raceTimed ? c.raceAt : c.date,
      location: { "@type": "Place", name: c.place, address: { "@type": "PostalAddress", addressLocality: c.place, ...(c.country ? { addressCountry: c.country } : {}) } },
    })),
  };

  const card = (c: CalendarCard) => (
    <li
      key={c.round}
      id={`r${c.round}`}
      className={`cl-card ${c.state}`}
      data-state={c.state}
      data-sprint={c.sprint ? "1" : "0"}
      data-race={c.state !== "done" ? (c.raceAt ?? undefined) : undefined}
      style={c.color ? ({ "--win": c.color } as CSSProperties) : undefined}
    >
      <div className="cl-top">
        <span className="cl-rnd num">{String(c.round).padStart(2, "0")}</span>
        {c.raceTimed && c.raceAt ? (
          <LocalDay className="cl-dt" iso={c.raceAt} locale={lang} />
        ) : (
          c.date && <span className="cl-dt">{dayFmt[lang].format(new Date(`${c.date}T00:00:00Z`))}</span>
        )}
        {c.sprint && <span className="cl-bd spr">{t.sprintTag}</span>}
      </div>
      <h3>{c.state === "done" ? <a href={path(`/seasons/${page.season}/${c.round}`)}>{c.gp}</a> : c.gp}</h3>
      {c.circuitSlug ? (
        <a className="cl-circ" href={path(`/circuits/${c.circuitSlug}`)}>
          {c.place}
        </a>
      ) : (
        <span className="cl-circ">{c.place}</span>
      )}
      {c.state === "done" ? (
        <dl className="cl-res">
          <div>
            <dt>{t.winner}</dt>
            <dd>{c.winners.map((w) => <Driver key={w.id} d={w} lang={lang} />)}</dd>
          </div>
          {c.poles.length > 0 && (
            <div>
              <dt>{t.pole}</dt>
              <dd>{c.poles.flat().map((d) => <Driver key={d.id} d={d} lang={lang} />)}</dd>
            </div>
          )}
          {c.sprintWinners.length > 0 && (
            <div>
              <dt>{t.sprint}</dt>
              <dd>{c.sprintWinners.map((d) => <Driver key={d.id} d={d} lang={lang} />)}</dd>
            </div>
          )}
          {/* Вирішальний етап — чемпіон на ім'я, а не значок поруч із переможцем гонки (відгук користувача 14.11:
              «Титул» біля Ферстаппена в Мехіко плутав — чемпіоном став Антонеллі). */}
          {c.decider && page.champion && (
            <div className="cl-title">
              <dt>{t.titleRow}</dt>
              <dd>
                <Driver d={page.champion} lang={lang} />
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <>
          {/* Видно лише коли гонка вже стартувала за часом клієнта, а результатів у збірці ще немає (live-rounds.tsx). */}
          <p className="cl-wait">{t.cardStarted}</p>
          <ul className="cl-sess">
            {c.sessions
              .filter((s) => s.at)
              .map((s) => (
                <li key={`${s.kind}-${s.at}`} className={s.kind === "R" ? "race" : undefined}>
                  {/* Коротко, як у макеті («П1»), повна назва — у підказці й для скрінрідера. */}
                  <abbr title={sessionLabel(s.kind, sessionNames)}>{sessionLabel(s.kind, t.sessionShort as Record<string, string>)}</abbr>
                  {s.real ? <LocalTime iso={s.at!} locale={lang} /> : <span className="num">{dayFmt[lang].format(new Date(s.at!))}</span>}
                </li>
              ))}
          </ul>
          {/* Погода вікенду — лише в картці наступної гонки: клієнт сам вирішує, чи пора (≤ 12 діб) і вантажить, коли картка поруч. */}
          {c.state === "next" && page.season >= WEATHER_FROM_YEAR && (
            <LazyWeekendWeather
              year={page.season}
              round={c.round}
              raceAt={c.raceAt}
              locale={lang}
              kinds={sessionsFromCalendar(c.sessions).map((x) => x.kind)}
              fullNames={sessionNames as Record<SessionKind, string>}
              labels={weekendLabels(dict.racePage.weather)}
              level={4}
            />
          )}
        </>
      )}
    </li>
  );

  return (
    <div className="cl-page" id="cl-page">
      <LiveRounds rootId="cl-page" />
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: dict.nav.calendar, path: "/calendar" }])} />
      <section className="cl-hero">
        <div className="wrap">
          <div>
            <span className="cl-stamp">
              {page.done === page.total
                ? fill(plural(page.total, lang, t.stampOver), { season: page.season, total: page.total })
                : fill(plural(page.total, lang, t.stamp), { season: page.season, done: page.done, total: page.total })}
            </span>
            <h1 className="display">
              {t.title} <span>{page.season}</span>
            </h1>
            <p className="cl-lead">{t.lead}</p>
            <p className="cl-lead">
              <a href={path("/kyiv-time")}>{t.kyivLink}</a>
            </p>
            <dl className="cl-kf" aria-label={t.factsLabel}>
              {page.champion && (
                <div>
                  <dt>{page.decided ? t.champion : t.leader}</dt>
                  <dd>
                    <Driver d={page.champion} lang={lang} />
                  </dd>
                </div>
              )}
              {page.cup && (
                <div>
                  <dt>{page.cup.decided ? t.cup : t.cupLeader}</dt>
                  <dd>
                    <Team t={page.cup.team} lang={lang} />
                  </dd>
                </div>
              )}
              <div>
                <dt>{t.sprints}</dt>
                <dd className="num">{n(page.sprints)}</dd>
              </div>
            </dl>
          </div>
          <NextRace
            rounds={upcoming}
            season={page.season}
            locale={lang}
            labels={{ nextRace: t.nextRace, roundK: t.roundK, countdownLabel: t.countdownLabel, days: t.days, hours: t.hours, minutes: t.minutes, raceStarted: t.raceStarted, seasonOver: t.seasonOver }}
          />
        </div>
      </section>

      <section className="cl-strip-sec" aria-label={t.stripLabel}>
        <div className="wrap">
          <ol className="cl-strip" style={{ "--n": page.cards.length } as CSSProperties}>
            {page.cards.map((c) => (
              <li
                key={c.round}
                className={c.state}
                data-race={c.state !== "done" ? (c.raceAt ?? undefined) : undefined}
                style={c.color ? ({ "--win": c.color } as CSSProperties) : undefined}
              >
                <a href={`#r${c.round}`} aria-label={`${c.round} · ${c.gp}${c.winners[0] ? ` · ${c.winners.map((w) => w.short).join(" / ")}` : ""}`}>
                  <i aria-hidden="true" />
                  <span className="num">{c.round}</span>
                </a>
              </li>
            ))}
          </ol>
          <p className="cl-key">
            {nextCard && <span className="k k-next">{t.keyNext}</span>}
            {counts.ahead > 1 && <span className="k k-later">{t.keyLater}</span>}
          </p>
          {page.legend.length > 0 && (
            <ul className="cl-legend">
              {page.legend.map((l) => (
                <li key={l.team.id}>
                  <Team t={l.team} lang={lang} /> <span className="num">{n(l.wins)}</span>
                </li>
              ))}
            </ul>
          )}
          {page.cancelled.length > 0 && <p className="cl-cancel">{fill(t.cancelled, { list: page.cancelled.map((c) => c.gp).join(", ") })}</p>}
        </div>
      </section>

      <section className="cl-sec" aria-labelledby="cl-rounds-h">
        <div className="wrap">
          <div className="cl-head">
            <h2 className="display" id="cl-rounds-h">
              {t.rounds}
            </h2>
            <RoundsFilter gridId="cl-grid" counts={counts} locale={lang} labels={{ filtersLabel: t.filtersLabel, filters: t.filters, count: t.count }} />
          </div>
          <ol className="cl-grid" id="cl-grid" data-f="all">
            {page.cards.map(card)}
          </ol>
        </div>
      </section>

      {/* Сезон без результатів (календар наступного року після фіналу) — без заліку, лише посилання на попередній. */}
      {page.started ? (
        <section className="cl-sec" aria-labelledby="cl-st-h">
          <div className="wrap">
            <div className="cl-head">
              <h2 className="display" id="cl-st-h">
                {t.standings}
              </h2>
              <a className="cl-more" href={path(`/seasons/${page.season}`)}>
                {fill(t.fullStandings, { season: page.season })}
              </a>
            </div>
            <div className="cl-tables">
              <div className="cl-tbl" role="region" aria-labelledby="cl-drv-cap" tabIndex={0}>
                <table>
                  <caption id="cl-drv-cap">{t.driversTop}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t.col.pos}</th>
                      <th scope="col">{t.col.driver}</th>
                      <th scope="col">{t.col.team}</th>
                      <th scope="col" className="cl-r">
                        {t.col.points}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.drivers.slice(0, CALENDAR_DRIVERS_TOP).map((r) => (
                      <tr key={r.driver.id}>
                        <td className="num">{r.position ?? "—"}</td>
                        <th scope="row">
                          <Driver d={r.driver} lang={lang} />
                        </th>
                        <td>{r.team && <Team t={r.team} lang={lang} />}</td>
                        <td className="cl-r num">{n(r.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {page.teams && (
                <div className="cl-tbl" role="region" aria-labelledby="cl-tm-cap" tabIndex={0}>
                  <table>
                    <caption id="cl-tm-cap">{t.teamsTitle}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t.col.pos}</th>
                        <th scope="col">{t.col.team}</th>
                        <th scope="col" className="cl-r">
                          {t.col.points}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.teams.map((r) => (
                        <tr key={r.team.id}>
                          <td className="num">{r.position ?? "—"}</td>
                          <th scope="row">
                            <Team t={r.team} lang={lang} />
                          </th>
                          <td className="cl-r num">{n(r.points)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {page.prev && (
              <a className="cl-nbr" href={path(`/seasons/${page.prev.year}`)}>
                {fill(t.prevSeason, { year: page.prev.year })}
              </a>
            )}
          </div>
        </section>
      ) : (
        page.prev && (
          <section className="cl-sec">
            <div className="wrap">
              <a className="cl-nbr" href={path(`/seasons/${page.prev.year}`)}>
                {fill(t.prevSeason, { year: page.prev.year })}
              </a>
            </div>
          </section>
        )
      )}

      <PageCredits groups={[{ title: t.credits, items: credits }]} />
    </div>
  );
}
