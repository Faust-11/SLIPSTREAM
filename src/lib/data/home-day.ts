// «Цей день у Формулі-1» для картки на головній: до трьох подій дня + сусідні дні. Головна статична й дати не знає —
// клієнт бере готовий JSON цього дня з /api/on-this-day/<мова>/<ММ-ДД> (статичні файли, збираються разом із сайтом).
// Порожній день (їх 5 на рік) замінюється найближчим наступним з подіями. Лише на сервері.
import "server-only";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { type EventKind, nearestDay, pickEvents } from "@/lib/home-day";
import { allDayKeys, neighbours } from "@/lib/on-this-day";
import { plural } from "@/lib/plural";
import { getDayPage, getHistoryDays } from "./on-this-day";

export type HomeDayEvent = { kind: EventKind; year: number; title: string; sub: string | null; href: string };
export type HomeDay = {
  /** Показаний день «ММ-ДД». */
  key: string;
  /** false — запитаний день порожній, показано найближчий з подіями. */
  exact: boolean;
  events: HomeDayEvent[];
  /** Скільки подій дня не вмістилось у картку (є на сторінці дня). */
  more: number;
  prev: string;
  next: string;
};

export async function getHomeDay(requested: string, locale: Locale): Promise<HomeDay | null> {
  const days = await getHistoryDays();
  const key = nearestDay(days, allDayKeys(), requested);
  const near = key ? neighbours(days, key) : null;
  if (!key || !near) return null;
  const [page, dict] = await Promise.all([getDayPage(key, locale), getDictionary(locale)]);
  if (!page) return null;
  const t = dict.onThisDay;
  const path = (p: string) => localizedPath(p, locale);
  const newest = <T extends { year: number }>(list: T[]) => [...list].sort((a, b) => b.year - a.year);

  const mk = (kind: EventKind, year: number, title: string, sub: string | null, href: string): HomeDayEvent => ({ kind, year, title, sub, href });
  const byKind = {
    race: newest(page.races).map((r) =>
      mk(
        "race",
        r.year,
        `${r.gp} ${r.year}`,
        [r.place, `${r.winners.length > 1 ? t.winners : t.winner}: ${r.winners.map((w) => w.name).join(", ")}`].filter(Boolean).join(" · "),
        path(`/seasons/${r.year}/${r.round}`),
      ),
    ),
    born: newest(page.births).map((p) => mk("born", p.year, p.name, null, path(`/drivers/${p.slug}`))),
    died: newest(page.deaths).map((p) =>
      mk("died", p.year, p.name, p.age !== null ? fill(plural(p.age, locale, t.yearsN), { n: p.age }) : null, path(`/drivers/${p.slug}`)),
    ),
  };
  const { events, more } = pickEvents(byKind, 3);
  return { key, exact: key === requested, events, more, prev: near.prev, next: near.next };
}
