import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { plural } from "@/lib/plural";
import type { CircuitCard as CircuitCardData } from "@/lib/data/circuits";

export type CircuitCardLabels = {
  races: string;
  mostWins: string;
  noRaces: string;
  noLayout: string;
  layoutLabel: string;
  yearsLabel: string;
  calendarBadge: string;
  /** «{n} пілотів» — коли найбільше перемог у трьох і більше (як у макеті). */
  tieDrivers: { one: string; few: string; many: string; other: string };
};

/** Схема списку — окремий SVG-файл як маска (колір — var(--ink), тема сайту); у HTML шляхів немає (бюджет TBT). */
export const layoutSrc = (ref: string) => `/img/circuits/layouts/${ref}.svg`;

/** Смуга сезонів fromYear…season: проміжки з гонкою — прямокутники (кілька на картку, не по одному на рік). */
function YearStrip({ spans, from, to }: { spans: [number, number][]; from: number; to: number }) {
  const n = to - from + 1;
  return (
    <svg className="ct-yrs" viewBox={`0 0 ${n} 12`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="bg" x="0" y="0" width={n} height="12" />
      {spans.map(([a, b]) => (
        <rect key={a} x={a - from} y="0" width={b - a + 1} height="12" />
      ))}
    </svg>
  );
}

export function CircuitCard({ c, labels, locale, season, fromYear }: { c: CircuitCardData; labels: CircuitCardLabels; locale: Locale; season: number; fromYear: number }) {
  const path = (p: string) => localizedPath(p, locale);
  const nf = new Intl.NumberFormat(locale);
  const titleId = `ct-${c.slug}`;
  return (
    <article className="ct-card" aria-labelledby={titleId}>
      <div className="ct-art">
        {c.layout ? (
          <span
            className="ct-lay"
            role="img"
            aria-label={fill(labels.layoutLabel, { name: c.name })}
            style={{ "--lay": `url(${layoutSrc(c.ref)})` } as CSSProperties}
          />
        ) : (
          <span className="ct-lay ct-none" aria-hidden="true">
            <span>{labels.noLayout}</span>
          </span>
        )}
        {c.onCalendar && (
          <span className="ct-cal num">
            <span aria-hidden="true">{season}</span>
            {/* title недоступний скрінрідерам — повний текст прихованим рядком (рев'ю 13.11). */}
            <span className="ct-sr">{fill(labels.calendarBadge, { season })}</span>
          </span>
        )}
      </div>
      <h3 id={titleId}>
        <a href={path(`/circuits/${c.slug}`)} translate="no">
          {c.name}
        </a>
      </h3>
      <p className="ct-loc">{[c.place, c.country].filter(Boolean).join(", ")}</p>
      {c.races > 0 ? (
        <div className="ct-yr">
          <YearStrip spans={c.spans} from={fromYear} to={season} />
          {/* aria-label на span без ролі скрінрідери ігнорують — прихований текст замість нього (рев'ю 13.11). */}
          <span className="num" aria-hidden="true">
            {c.spansLabel}
          </span>
          <span className="ct-sr">{fill(labels.yearsLabel, { years: c.spansLabel })}</span>
        </div>
      ) : (
        <p className="ct-yr ct-soon">{labels.noRaces}</p>
      )}
      <dl className="ct-kv">
        <div>
          <dt>{labels.races}</dt>
          <dd className="num ct-n">{nf.format(c.races)}</dd>
        </div>
        {c.topWinners && (
          <div>
            <dt>{labels.mostWins}</dt>
            <dd className="ct-wn">
              {c.topWinners.drivers.length === 0 ? (
                <span className="ct-ties">{fill(plural(c.topWinners.count, locale, labels.tieDrivers), { n: c.topWinners.count })}</span>
              ) : (
                c.topWinners.drivers.map((d, i) => {
                  const link = (
                    <a key={d.id} className="ct-ent" href={path(`/drivers/${d.slug}`)}>
                      {d.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="ct-av" src={d.avatar} width={26} height={26} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="ct-av ct-ini" aria-hidden="true">
                          {d.initials}
                        </span>
                      )}
                      <span>{d.short}</span>
                    </a>
                  );
                  // Число перемог — разом з останнім ім'ям, без переносу на окремий рядок (рев'ю 13.11).
                  return i === c.topWinners!.drivers.length - 1 ? (
                    <span key={d.id} className="ct-last">
                      {link}
                      <b className="num">{nf.format(c.topWinners!.wins)}</b>
                    </span>
                  ) : (
                    link
                  );
                })
              )}
              {c.topWinners.drivers.length === 0 && <b className="num">{nf.format(c.topWinners.wins)}</b>}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
