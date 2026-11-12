import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { DriversBrowser } from "@/components/drivers/drivers-browser";
import { TeamsIntro } from "@/components/teams/teams-intro";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { getDictionary } from "@/i18n/get-dictionary";
import { requireLocale } from "@/i18n/require-locale";
import { getDriversIndex, packDriver } from "@/lib/data/drivers";
import { getTeamsSeason } from "@/lib/data/teams";
import { DEFAULT_DRIVERS_QUERY, selectDrivers } from "@/lib/drivers-list";
import { plural } from "@/lib/plural";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return pageMetadata({ locale: lang, path: "/drivers", title: dict.nav.drivers, description: dict.meta.sections.drivers });
}

export default async function DriversPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.drivers;
  const [rows, season] = await Promise.all([getDriversIndex(lang), getTeamsSeason()]);
  // У типовому порядку (перемоги ↓): клієнт показує першу сторінку без сортування (TBT, Lighthouse 12.11).
  const all = selectDrivers(rows, DEFAULT_DRIVERS_QUERY, lang);
  const packed = all.map(packDriver);
  const nf = new Intl.NumberFormat(lang);
  const count = (n: number, forms: typeof t.facts.drivers) => ({ value: n, label: plural(n, lang, forms) });
  const current = rows
    .filter((r) => r.current)
    .sort((a, b) => (a.current!.position ?? 99) - (b.current!.position ?? 99) || b.current!.points - a.current!.points);
  const labels = { ...t, filters: { ...t.filters, cur: fill(t.filters.cur, { year: season }) } };

  return (
    <>
      <TeamsIntro
        title={dict.nav.drivers}
        factsLabel={t.factsLabel}
        facts={[
          count(rows.length, t.facts.drivers),
          count(rows.filter((r) => r.titles > 0).length, t.facts.champions),
          count(rows.filter((r) => r.wins > 0).length, t.facts.winners),
        ]}
      />
      <section className="sec drv" aria-labelledby="drv-now">
        <div className="wrap">
          <div className="sec-head">
            <h2 className="display" id="drv-now">
              {fill(t.season, { year: season })}
            </h2>
          </div>
          <ol className="drv-now">
            {current.map((r) => (
              <li key={r.id} className="drv-card" style={{ "--team": r.current!.color } as CSSProperties}>
                <span className="top">
                  <span className="pos num">{r.current!.position ? `P${r.current!.position}` : "—"}</span>
                  {r.current!.number !== null && <span>{fill(t.number, { n: r.current!.number })}</span>}
                  <span className="pts num">{fill(plural(r.current!.points, lang, t.points), { n: nf.format(r.current!.points) })}</span>
                </span>
                <span className="who">
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="av" src={r.avatar} width={44} height={44} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="av av-ini" aria-hidden="true">
                      {r.initials}
                    </span>
                  )}
                  <span>
                    <b>{r.name}</b>
                    <small translate="no">{r.current!.team}</small>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="sec drv" aria-labelledby="drv-all">
        <div className="wrap">
          <div className="sec-head">
            <h2 className="display" id="drv-all">
              {t.all}
            </h2>
          </div>
          <DriversBrowser packed={packed} locale={lang} labels={labels} />
          <noscript>
            {/* Без JS — увесь перелік простим текстом (перемоги ↓): ім'я, роки, перемоги / старти. */}
            <ol className="drv-noscript">
              {all.map((r) => (
                <li key={r.id}>{`${r.name} (${r.years[0]}–${r.years[1]}): ${nf.format(r.wins)} / ${nf.format(r.starts)}`}</li>
              ))}
            </ol>
          </noscript>
        </div>
      </section>
      <section className="page-credits" data-surface="dark">
        <div className="wrap">
          <a className="credits-link" href={localizedPath("/drivers/credits", lang)}>
            {t.credits} →
          </a>
        </div>
      </section>
    </>
  );
}
