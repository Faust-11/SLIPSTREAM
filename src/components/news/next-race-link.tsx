"use client";

import { liveStates, useNow } from "@/components/calendar/clock";
import { LocalTime } from "@/components/calendar/local-time";
import type { Locale } from "@/i18n/config";

export type NextRaceItem = { round: number; gp: string; raceAt: string; href: string };

/** Наступна гонка за часом клієнта (дані оновлюються пн/чт, гонка — у нд); сервер і без JS — перша непроведена за даними. */
export function NextRaceLink({ rounds, locale, label }: { rounds: NextRaceItem[]; locale: Locale; label: string }) {
  const now = useNow();
  const states = now === null ? null : liveStates(rounds.map((r) => r.raceAt), now);
  const next = states === null ? rounds[0] : rounds[states.indexOf("next")];
  if (!next) return null;
  return (
    <a className="nw-next" href={next.href}>
      <span>{label}</span>
      <b>{next.gp}</b>
      <LocalTime iso={next.raceAt} locale={locale} />
    </a>
  );
}
