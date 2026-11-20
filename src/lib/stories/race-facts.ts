import "server-only";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { getSeasonPage } from "@/lib/data/season-page";

/** Факти банера з бази: Гран-прі, етап «N з M», дата, траса — за race / links.races[0] історії. */
export const raceFacts = cache(async (year: number, round: number, lang: Locale) => {
  const season = await getSeasonPage(year, lang);
  const rounds = (season?.calendar ?? []).filter((r) => !r.cancelled && r.round !== null);
  const r = rounds.find((x) => x.round === round);
  return r ? { gp: r.gp, round, total: rounds.length, date: r.date, place: r.place, circuit: r.circuit } : null;
});

export type RaceFacts = NonNullable<Awaited<ReturnType<typeof raceFacts>>>;
