"use client";

import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { useNow } from "./clock";
import { formatDay, LocalTime } from "./local-time";

export type UpcomingRound = {
  round: number;
  gp: string;
  place: string;
  /** Початок гонки (UTC, ISO); час невідомий — кінець дня гонки (calendar.ts raceStart). */
  raceAt: string;
  /** real = false — відома лише дата сесії (північ у базі): показуємо дату без часу. */
  sessions: { label: string; at: string; race: boolean; real: boolean }[];
};
export type NextRaceLabels = { nextRace: string; roundK: string; countdownLabel: string; days: string; hours: string; minutes: string; raceStarted: string; seasonOver: string };

const left = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
};

/**
 * Блок «Наступна гонка»: сервер показує першу непроведену за даними; клієнт — першу, чия гонка ще не стартувала
 * (дані оновлюються пн/чт, а гонка — у нд), і веде зворотний відлік (крок clock.ts TICK; без JS — лише розклад у UTC).
 * rounds — етапи без результатів у даних; порожньо — сезон завершено за даними. Усі вже стартували (фінал до
 * оновлення даних) — останній етап зі «стартувала», а не «сезон завершено» (рев'ю PR #19).
 */
export function NextRace({ rounds, season, locale, labels }: { rounds: UpcomingRound[]; season: number; locale: Locale; labels: NextRaceLabels }) {
  const now = useNow();
  if (rounds.length === 0) {
    return (
      <div className="cl-next">
        <b className="cl-next-name">{fill(labels.seasonOver, { season })}</b>
      </div>
    );
  }
  const next = now === null ? rounds[0] : rounds.find((r) => Date.parse(r.raceAt) > now);
  const started = now === null ? undefined : rounds.filter((r) => Date.parse(r.raceAt) <= now).at(-1);
  const shown = next ?? started!;
  // now — початок поточного кроку (реальний час у [now, now + TICK)): мінус 1 мс — і на межі кроку хвилини точні
  // (старт гонки — ціла хвилина, крок ділить хвилину), а не на одну більше.
  const c = next && now !== null ? left(Date.parse(next.raceAt) - now - 1) : null;
  return (
    <div className="cl-next">
      <span className="cl-next-k">{fill(next ? labels.nextRace : labels.roundK, { round: shown.round })}</span>
      <b className="cl-next-name">
        {/* Посилання — лише назва (увесь блок як посилання давав доступну назву ~230 символів, рев'ю PR #19). */}
        <a href={`#r${shown.round}`}>{shown.gp}</a>
      </b>
      <span className="cl-next-place">{shown.place}</span>
      {next && (
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
      )}
      {next && (
        <ul className="cl-sess">
          {next.sessions.map((s) => (
            <li key={s.at + s.label} className={s.race ? "race" : undefined}>
              <span>{s.label}</span>
              {s.real ? <LocalTime iso={s.at} locale={locale} /> : <span className="num">{formatDay(s.at, locale, "UTC")}</span>}
            </li>
          ))}
        </ul>
      )}
      {started && <p className="cl-next-note">{fill(labels.raceStarted, { round: started.round })}</p>}
    </div>
  );
}
