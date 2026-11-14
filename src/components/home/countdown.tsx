"use client";

import { timeLeft, useNow } from "@/components/calendar/clock";
import { fill } from "@/i18n/fill";

export type CountdownLabels = { label: string; days: string; hours: string; minutes: string; started: string; then: string };
export type CountdownRound = { round: number; gp: string; raceAt: string };

/**
 * Відлік до старту наступної гонки (крок — clock.ts TICK). Як календар (NextRace): клієнт бере перший етап, що ще не
 * стартував, — дані оновлюються після фінішу, і до того збірка вважала б наступною вже стартовану (рев'ю PR #25).
 * Сервер і перший кадр — «—» (без розбіжності гідратації). Сітка відліку завжди тієї ж висоти — без зсуву розкладки.
 */
export function HmCountdown({ rounds, shown, labels }: { rounds: CountdownRound[]; shown: number; labels: CountdownLabels }) {
  const now = useNow();
  const next = now === null ? rounds.find((r) => r.round === shown) : rounds.find((r) => Date.parse(r.raceAt) > now);
  const startedShown = now !== null && rounds.some((r) => r.round === shown && Date.parse(r.raceAt) <= now);
  const c = next && now !== null ? timeLeft(Date.parse(next.raceAt) - now - 1) : null;
  return (
    <div className="hm-count-wrap">
      {startedShown && (
        <p className="hm-count-note">
          {labels.started}
          {next && ` ${fill(labels.then, { round: next.round, gp: next.gp })}`}
        </p>
      )}
      {(next || !startedShown) && (
        <div className="hm-count" role="timer" aria-label={labels.label}>
          {(
            [
              [c?.d, labels.days],
              [c?.h, labels.hours],
              [c?.m, labels.minutes],
            ] as const
          ).map(([v, l]) => (
            <div key={l}>
              <b className="num">{v ?? "—"}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
