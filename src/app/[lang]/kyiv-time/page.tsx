import type { Metadata } from "next";
import { SectionHero } from "@/components/site/section-hero";
import { JsonLd } from "@/components/site/json-ld";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getCalendarPage, type CalendarCard, type CalendarSession } from "@/lib/data/calendar";
import { fmtDay, fmtSession } from "@/lib/fmt";
import { breadcrumbList } from "@/lib/jsonld";
import { kyivIso, kyivOffsetLabel, toKyiv } from "@/lib/kyiv-time";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

/** Назва сесії: повна, зі словника сторінки гонки (кваліфікації з частинами — «Кваліфікація»). */
function sessionLabel(kind: CalendarSession["kind"], names: Record<string, string>): string {
  if (kind === "Q1" || kind === "QB" || kind === "QA") return names.Q!;
  if (kind === "SQ1") return names.SQ!;
  return names[kind] ?? kind;
}

/** «пт, 20 лист. · 02:30» у київському часі. */
const kyivSession = (iso: string, lang: "uk" | "en") => fmtSession(toKyiv(iso).toISOString(), lang, true);
/** Лише день («20 лист.») у київському часі. */
const kyivDay = (iso: string, lang: "uk" | "en") => fmtDay(toKyiv(iso).toISOString(), lang, true);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const page = await getCalendarPage(lang);
  return pageMetadata({
    locale: lang,
    path: "/kyiv-time",
    title: dict.kyivPage.title,
    description: fill(dict.kyivPage.metaDescription, { season: page.season }),
  });
}

export default async function KyivTimePage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.kyivPage;
  const sessionNames = dict.racePage.session as Record<string, string>;
  const page = await getCalendarPage(lang);
  const path = (p: string) => localizedPath(p, lang);
  const next = page.cards.find((c) => c.state === "next") ?? null;

  /** Старт гонки етапу в таблиці: час (з поясом) або лише дата з поміткою, що час уточнюється. */
  const raceCell = (c: CalendarCard) => {
    if (c.raceTimed && c.raceAt) {
      return (
        <time dateTime={kyivIso(c.raceAt)} className="num">
          {kyivSession(c.raceAt, lang)}
        </time>
      );
    }
    return (
      <>
        {c.date ? <span className="num">{fmtDay(`${c.date}T00:00:00Z`, lang, true)}</span> : null} <span className="kt-tbd">{t.tbd}</span>
      </>
    );
  };

  const upcomingTimed = page.cards.filter((c) => c.state !== "done" && c.raceTimed && c.raceAt);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${t.title} — ${page.season}`,
    itemListElement: upcomingTimed.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsEvent",
        name: `${c.gp} ${page.season}`,
        sport: "Formula One",
        startDate: kyivIso(c.raceAt!),
        location: { "@type": "Place", name: c.place },
        url: new URL(path(`/calendar#r${c.round}`), siteUrl()).href,
      },
    })),
  };

  const [noteBefore, noteAfter] = t.note.split("{calendar}");

  return (
    <div className="kt-page">
      <JsonLd data={jsonLd} />
      <JsonLd
        data={breadcrumbList(lang, [
          { name: dict.nav.calendar, path: "/calendar" },
          { name: t.title, path: "/kyiv-time" },
        ])}
      />
      <SectionHero section="calendar" title={t.title} />
      <div className="wrap kt-body">
        <p className="kt-lead">{fill(t.lead, { season: page.season })}</p>

        {next ? (
          <section className="kt-next" aria-labelledby="kt-next-h">
            <p className="kt-eyebrow">
              {t.nextTitle} · {fill(t.roundN, { n: next.round })}
            </p>
            <h2 id="kt-next-h">{next.gp}</h2>
            <p className="kt-place">{next.place}</p>
            <ul className="kt-sess" aria-label={t.sessionsLabel}>
              {next.sessions
                .filter((s) => s.at)
                .map((s) => (
                  <li key={`${s.kind}-${s.at}`} className={s.kind === "R" ? "race" : undefined}>
                    <span>{s.kind === "R" ? t.raceStart : sessionLabel(s.kind, sessionNames)}</span>
                    {s.real ? (
                      <span>
                        <time dateTime={kyivIso(s.at!)} className="num">
                          {kyivSession(s.at!, lang)}
                        </time>{" "}
                        <span className="kt-off">{kyivOffsetLabel(s.at!)}</span>
                      </span>
                    ) : (
                      <span>
                        <span className="num">{kyivDay(s.at!, lang)}</span> <span className="kt-tbd">{t.tbd}</span>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ) : (
          <p className="kt-over">{t.seasonOver}</p>
        )}

        <section aria-labelledby="kt-all-h">
          <h2 id="kt-all-h">{fill(t.allTitle, { season: page.season })}</h2>
          <table className="kt-table" aria-label={t.tableLabel}>
            <thead>
              <tr>
                <th scope="col">{t.colRound}</th>
                <th scope="col">{t.colGp}</th>
                <th scope="col">{t.colRace}</th>
                <th scope="col" className="kt-offcol">
                  {t.colOffset}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.cards.map((c) => (
                <tr key={c.round} className={c.state}>
                  <td className="num">{c.round}</td>
                  <th scope="row">
                    {c.state === "done" ? <a href={path(`/seasons/${page.season}/${c.round}`)}>{c.gp}</a> : c.gp}
                    {c.sprint ? <span className="kt-tag">{t.sprintTag}</span> : null}
                    <span className="kt-sub">{c.place}</span>
                  </th>
                  <td>{raceCell(c)}</td>
                  <td className="kt-offcol num">{c.raceTimed && c.raceAt ? kyivOffsetLabel(c.raceAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="kt-note">
          {noteBefore}
          <a href={path("/calendar")}>{t.calendarLink}</a>
          {noteAfter}
        </p>
      </div>
    </div>
  );
}
