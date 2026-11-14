"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { LocalTime } from "./local-time";

export type UpcomingRound = {
  round: number;
  gp: string;
  place: string;
  /** Початок гонки (UTC, ISO). */
  raceAt: string;
  sessions: { label: string; at: string; race: boolean }[];
};
export type NextRaceLabels = { nextRace: string; countdownLabel: string; days: string; hours: string; minutes: string; raceStarted: string; seasonOver: string };

const left = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
};

/**
 * Блок «Наступна гонка»: сервер показує першу непроведену за даними; клієнт — першу, чия гонка ще не стартувала
 * (дані оновлюються пн/чт, а гонка — у нд: до оновлення сторінка інакше вважала б наступною вже проведену), і веде
 * зворотний відлік (раз на 30 с; без JS — лише розклад у UTC).
 */
const TICK = 30_000;
const subscribeTick = (cb: () => void) => {
  const t = setInterval(cb, TICK);
  return () => clearInterval(t);
};
/** Поточний час з кроком 30 с (стабільний знімок між тіками); на сервері й під час гідратації — null. */
const nowSnapshot = () => Math.floor(Date.now() / TICK) * TICK;

export function NextRace({ rounds, season, locale, labels }: { rounds: UpcomingRound[]; season: number; locale: Locale; labels: NextRaceLabels }) {
  const now = useSyncExternalStore(subscribeTick, nowSnapshot, () => null);
  const next = now === null ? rounds[0] : rounds.find((r) => Date.parse(r.raceAt) > now);
  const started = now === null ? null : rounds.filter((r) => Date.parse(r.raceAt) <= now).at(-1);
  if (!next) {
    return (
      <div className="cl-next">
        <b className="cl-next-name">{fill(labels.seasonOver, { season })}</b>
        {started && <p className="cl-next-note">{fill(labels.raceStarted, { round: started.round })}</p>}
      </div>
    );
  }
  const c = now === null ? null : left(Date.parse(next.raceAt) - now);
  return (
    <a className="cl-next" href={`#r${next.round}`}>
      <span className="cl-next-k">{fill(labels.nextRace, { round: next.round })}</span>
      <b className="cl-next-name">{next.gp}</b>
      <span className="cl-next-place">{next.place}</span>
      <span className="cl-count" role="timer" aria-label={labels.countdownLabel}>
        {(
          [
            [c?.d, labels.days],
            [c?.h, labels.hours],
            [c?.m, labels.minutes],
          ] as const
        ).map(([v, l]) => (
          <span key={l}>
            <b className="num">{v ?? "—"}</b>
            <span>{l}</span>
          </span>
        ))}
      </span>
      <ul className="cl-sess">
        {next.sessions.map((s) => (
          <li key={s.at + s.label} className={s.race ? "race" : undefined}>
            <span>{s.label}</span>
            <LocalTime iso={s.at} locale={locale} />
          </li>
        ))}
      </ul>
      {started && <span className="cl-next-note">{fill(labels.raceStarted, { round: started.round })}</span>}
    </a>
  );
}
