"use client";

import { useEffect, useId } from "react";
import type { Locale } from "@/i18n/config";
import type { SessionKind, WeatherSession } from "@/lib/weather";
import { precipText, span, type PrecipLabels } from "./format";
import { WeatherSkeleton } from "./skeleton";
import { useWeather } from "./use-weather";

/** Підписи компактного блока (календар, головна): лише потрібне — передаються з сервера в HTML сторінки. */
export type WeekendWeatherLabels = PrecipLabels & {
  title: string;
  caption: string;
  loading: string;
  cols: { track: string };
  srcShort: Record<WeatherSession["state"], string>;
  creditLead: string;
  creditMeasured: string;
  creditForecast: string;
};

export type WeekendWeatherProps = {
  year: number;
  round: number;
  locale: Locale;
  kinds: SessionKind[];
  fullNames: Record<SessionKind, string>;
  labels: WeekendWeatherLabels;
  /** Рівень заголовка блока: 3 — на головній, 4 — усередині картки календаря (там h3 — назва Гран-прі). */
  level?: 3 | 4;
  /** Немає що показати (джерела недоступні чи даних ще нема): обгортка ховає місце під блок. */
  onEmpty?: () => void;
};

/**
 * Компактна погода вікенду для картки наступної гонки: рядок на сесію: назва сесії й слово-джерело («виміряно» / «іде зараз» / «прогноз»),
 * під ними повітря й траса та опади (замір чи стан неба прогнозу). Дані — /api/weather (ISR 10 хв),
 * показ і завантаження коду — в lazy-weather.tsx. Без Intl (fmt.ts не потрібен: час сесій тут не виводимо).
 */
export function WeekendWeather({ year, round, locale, kinds, fullNames, labels, level = 4, onEmpty }: WeekendWeatherProps) {
  const id = useId();
  const data = useWeather(year, round);
  const empty = data === "error" || (data !== null && !data.sessions.some((s) => s.data));
  useEffect(() => {
    if (empty) onEmpty?.();
  }, [empty, onEmpty]);

  if (empty) return null;
  if (data === null) return <WeatherSkeleton n={kinds.length} label={labels.loading} />;

  const rows = data.sessions.filter((s): s is WeatherSession & { data: NonNullable<WeatherSession["data"]> } => !!s.data);
  const H = level === 3 ? "h3" : "h4";
  return (
    <section className="ww" aria-labelledby={id}>
      <H className="ww-h display" id={id}>
        {labels.title}
      </H>
      <ul className="ww-list" role="list" aria-label={labels.caption}>
        {rows.map((s, i) => (
          <li key={`${s.kind}-${i}`} className={`ww-row ww-${s.state}`}>
            <span className="ww-top">
              <b className="ww-k">{fullNames[s.kind]}</b>
              <span className="ww-s">{labels.srcShort[s.state]}</span>
            </span>
            <span className="ww-v">
              <span className="ww-t">
                {span(s.data.air, "°C")}
                {s.data.track ? ` · ${labels.cols.track} ${span(s.data.track, "°C")}` : ""}
              </span>
              <span className="ww-p"> · {precipText(s.data, labels, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="ww-credit">
        {labels.creditLead}{" "}
        <a href="https://openf1.org" rel="noopener">
          OpenF1
        </a>{" "}
        — {labels.creditMeasured}; <a href="https://www.met.no/en" rel="noopener">MET Norway</a> — {labels.creditForecast}.
      </p>
    </section>
  );
}
