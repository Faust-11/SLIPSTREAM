"use client";

import { useNow } from "@/components/calendar/clock";

export type CountdownLabels = { label: string; days: string; hours: string; minutes: string; started: string };

/**
 * Відлік до старту наступної гонки (крок — clock.ts TICK). Сервер і перший кадр — «—» (без розбіжності гідратації);
 * гонка вже стартувала (дані оновлюються після фінішу) — рядок «стартувала» замість нулів.
 */
export function HmCountdown({ raceAt, labels }: { raceAt: string; labels: CountdownLabels }) {
  const now = useNow();
  const ms = now === null ? null : Date.parse(raceAt) - now - 1;
  if (ms !== null && ms <= 0) return <p className="hm-count-started">{labels.started}</p>;
  const m = ms === null ? null : Math.floor(ms / 60000);
  const parts: [number | null, string][] = [
    [m === null ? null : Math.floor(m / 1440), labels.days],
    [m === null ? null : Math.floor((m % 1440) / 60), labels.hours],
    [m === null ? null : m % 60, labels.minutes],
  ];
  return (
    <div className="hm-count" role="timer" aria-label={labels.label}>
      {parts.map(([v, l]) => (
        <div key={l}>
          <b className="num">{v ?? "—"}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}
