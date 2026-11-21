"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { fmtSession } from "@/lib/fmt";
import { compassIndex, type Condition, type SessionKind, type WeatherData, type WeatherSession } from "@/lib/weather";

export type RaceWeatherLabels = {
  title: string;
  caption: string;
  note: string;
  cols: { session: string; air: string; track: string; humidity: string; wind: string; precip: string };
  src: { done: string; live: string; forecast: string; none: string };
  dry: string;
  rain: string;
  mm: string;
  calm: string;
  cond: Record<Condition, string>;
  compass: string[];
  unitWind: string;
  windNote: string;
  loading: string;
  creditLead: string;
  creditMeasured: string;
  creditForecast: string;
};

type Payload = { sessions: WeatherSession[] };
const DASH = "—";

/**
 * Погода вікенду в блоці «Вікенд» сторінки гонки: заміри OpenF1 для сесій, що були (чи йдуть), прогноз MET Norway — для
 * майбутніх. Сама сторінка статична: дані клієнт бере з /api/weather/<рік>/<етап> (ISR 10 хв). Без Intl (fmt.ts).
 * Поки чекаємо — заглушка тієї ж кількості рядків (без зсуву розкладки); немає жодних даних (джерела недоступні) —
 * блок не показуємо; без JavaScript його нема взагалі.
 */
export function RaceWeather({ year, round, locale, kinds, sessionNames, labels }: { year: number; round: number; locale: Locale; kinds: SessionKind[]; sessionNames: Record<SessionKind, string>; labels: RaceWeatherLabels }) {
  const [data, setData] = useState<Payload | "error" | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/weather/${year}/${round}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setData("error");
      });
    return () => ctl.abort();
  }, [year, round]);

  if (data === "error" || (data && !data.sessions.some((s) => s.data))) return null;

  const num = (n: number) => String(Math.round(n));
  const span = (r: [number, number], unit: string) => {
    const a = Math.round(r[0]);
    const b = Math.round(r[1]);
    return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`;
  };
  const mm = (v: number) => fill(labels.mm, { n: locale === "uk" ? v.toFixed(1).replace(".", ",") : v.toFixed(1) });
  const wind = (w: WeatherData["wind"]) => {
    if (!w) return DASH;
    if (w.kmh < 1) return labels.calm;
    const speed = `${num(w.kmh)} ${labels.unitWind}`;
    return w.from === null ? speed : `${labels.compass[compassIndex(w.from)] ?? ""} · ${speed}`;
  };
  const precip = (d: WeatherData) => {
    if (d.rainShare !== null) return d.rainShare === 0 ? labels.dry : fill(labels.rain, { n: Math.max(1, Math.round(d.rainShare * 100)) });
    const cond = d.condition ? labels.cond[d.condition] : null;
    const amount = d.mm !== null && d.mm >= 0.1 ? mm(d.mm) : null;
    return cond && amount ? `${cond} · ${amount}` : (cond ?? amount ?? DASH);
  };
  const cells = (d: WeatherData | null): string[] =>
    d ? [span(d.air, "°C"), d.track ? span(d.track, "°C") : DASH, d.humidity !== null ? `${num(d.humidity)}%` : DASH, wind(d.wind), precip(d)] : [DASH, DASH, DASH, DASH, DASH];
  const heads = [labels.cols.air, labels.cols.track, labels.cols.humidity, labels.cols.wind, labels.cols.precip];

  const rows = data ? data.sessions : null;
  const when = (s: WeatherSession) => (s.start ? `${fmtSession(s.start, locale, true)} UTC` : "");

  return (
    <div className="rw" aria-labelledby="rw-h" aria-busy={rows === null}>
      <h3 className="display" id="rw-h">{labels.title}</h3>
      <p className="rw-note">{labels.note}</p>
      {rows === null ? (
        <div className="rw-wait" aria-live="polite">
          <p className="sr-only">{labels.loading}</p>
          {kinds.map((k, i) => (
            <span key={`${k}-${i}`} className="rw-sk" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <>
          <table className="rw-tbl">
            <caption className="sr-only">{labels.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.cols.session}</th>
                {heads.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.kind}-${i}`}>
                  <th scope="row">
                    <b>{sessionNames[s.kind]}</b>
                    <span className="rw-t">{when(s)}</span>
                    <span className={`rw-src rw-${s.state}`}>{labels.src[s.state]}</span>
                  </th>
                  {cells(s.data).map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="rw-cards" role="list">
            {rows.map((s, i) => (
              <li key={`${s.kind}-${i}`}>
                <div className="rw-ch">
                  <b>{sessionNames[s.kind]}</b>
                  <span className="rw-t">{when(s)}</span>
                </div>
                <span className={`rw-src rw-${s.state}`}>{labels.src[s.state]}</span>
                <dl>
                  {cells(s.data).map((c, j) => (
                    <div key={j}>
                      <dt>{heads[j]}</dt>
                      <dd>{c}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <p className="rw-note rw-credit">
            {labels.windNote} {labels.creditLead}{" "}
            <a href="https://openf1.org" rel="noopener">
              OpenF1
            </a>{" "}
            — {labels.creditMeasured}; <a href="https://www.met.no/en" rel="noopener">MET Norway</a> — {labels.creditForecast}.
          </p>
        </>
      )}
    </div>
  );
}
