import Image from "next/image";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { TeamCard as TeamCardData } from "@/lib/data/teams";
import { seasonStripGradient, seasonsText } from "@/lib/season-strip";

/** Підписи картки — уже мовою сторінки (шаблони з `{year}`, `{pos}`). */
export type TeamCardLabels = {
  stats: { grandsPrix: string; wins: string; titles: string };
  seasons: string;
  position: string;
  positionLabel: string;
  drivers: string;
};

type Props = {
  card: TeamCardData;
  labels: TeamCardLabels;
  locale: Locale;
  season: number;
  /** 0 — preload (LCP), 1–3 — eager (перший ряд), решта — lazy. */
  index: number;
};

// Ширина картки за сіткою: 1 / 2 / 3 / 4 колонки (teams.css), поле .wrap 16 px, проміжок 16 px.
// ≤ 520 px — компактна горизонтальна картка з фото 128 px (teams.css).
const SIZES = "(width <= 520px) 128px, (width <= 860px) calc(50vw - 24px), (width <= 1100px) calc(33vw - 22px), 304px";
const numberFormat = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };

/** Картка команди. Без хуків — рендериться і в серверному фолбеку, і в клієнтському списку. */
export function TeamCard({ card, labels, locale, season, index }: Props) {
  const n = (v: number) => numberFormat[locale].format(v);
  const titleId = `team-${card.id}`;
  const style = card.current ? ({ "--team": card.current.color } as CSSProperties) : undefined;
  return (
    <article
      className={card.current ? "tc is-current" : "tc"}
      style={style}
      aria-labelledby={titleId}
      data-id={card.id}
      tabIndex={-1}
    >
      <div className="tc-art">
        {card.photo ? (
          <Image
            src={card.photo.src}
            width={card.photo.width}
            height={card.photo.height}
            alt={card.photo.alt}
            sizes={SIZES}
            preload={index === 0}
            loading={index === 0 ? undefined : index < 4 ? "eager" : "lazy"}
          />
        ) : (
          <span className="tc-none" aria-hidden="true" translate="no">
            {card.countryCode}
          </span>
        )}
        {card.current && (
          // aria-label на <span> заборонений (ARIA 1.2, generic) — повна фраза для дикторів окремо.
          <p className="tc-pos num">
            <span aria-hidden="true">{fill(labels.position, { year: season, pos: card.current.position })}</span>
            <span className="sr-only">{fill(labels.positionLabel, { year: season, pos: card.current.position })}</span>
          </p>
        )}
      </div>
      <h2 id={titleId} className="tc-name" translate="no">
        {card.name}
      </h2>
      <p className="tc-loc">{card.country}</p>
      <div className="tc-yr">
        <span className="tc-strip" aria-hidden="true" style={{ backgroundImage: seasonStripGradient(card.seasons) }} />
        <span className="tc-yt num">
          <span className="sr-only">{labels.seasons}: </span>
          {seasonsText(card.seasons)}
        </span>
      </div>
      <dl className="tc-st">
        <div>
          <dt>{labels.stats.grandsPrix}</dt>
          <dd className="num">{n(card.grandsPrix)}</dd>
        </div>
        <div>
          <dt>{labels.stats.wins}</dt>
          <dd className="num">{n(card.wins)}</dd>
        </div>
        <div>
          <dt>{labels.stats.titles}</dt>
          <dd className="num">{n(card.titles)}</dd>
        </div>
      </dl>
      {card.current && card.current.drivers.length > 0 && (
        <div className="tc-crew">
          <p className="tc-lbl">{fill(labels.drivers, { year: season })}</p>
          <ul>
            {card.current.drivers.map((d) => (
              <li key={d.id}>
                {d.avatar ? (
                  <Image className="av" src={d.avatar} width={28} height={28} alt="" loading="lazy" />
                ) : (
                  <span className="av av-ini" aria-hidden="true">
                    {d.initials}
                  </span>
                )}
                <span>{d.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
