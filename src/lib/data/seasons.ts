// Список сезонів: числа — з подання f1.season_index (0010), фото й кольори — src/data/curated/seasons.json. Лише на сервері.
import "server-only";
import driverHeroesJson from "@/data/curated/driver-heroes.json";
import seasonsJson from "@/data/curated/seasons.json";
import type { Locale } from "@/i18n/config";
import { driverSlug } from "@/lib/driver-slug";
import { dbSelectAll } from "./db";
import { splitName } from "./driver-page";
import { driverName, driverPortrait } from "./drivers";
import { once } from "./once";
import { curatedTeams } from "./teams";
import type { Credit, SeasonIndexRow } from "./types";

type CuratedSeason = {
  /** Пілот на фото (латиницею) — фото показуємо, лише якщо це чемпіон / лідер сезону. */
  driver: string;
  /** Колір команди чемпіона того сезону (історичні лівреї). */
  color: string;
  photo?: { src: string; srcSet: string; width: number; height: number; focus: string };
  credit?: Credit;
};
const curated = (seasonsJson as unknown as { seasons: Record<string, CuratedSeason> }).seasons;
const heroes = (driverHeroesJson as unknown as { drivers: Record<string, number[]> }).drivers;
const teamsById = new Map(curatedTeams.map((t) => [t.id, t]));

const loadSeasons = once(() =>
  dbSelectAll<SeasonIndexRow>(
    "season_index",
    "select=year,races,rounds,in_progress,driver,forename,surname,points,driver_decided,teams,wins,cup_team,cup_decided&order=year",
  ),
);

export type SeasonTeam = { id: string; name: string };
export type SeasonCard = {
  year: number;
  /** Чемпіон або лідер поточного сезону. */
  driver: null | { id: string; slug: string; name: string; initials: string };
  teams: SeasonTeam[];
  /** Колір смуги картки: команда чемпіона того сезону; null — нейтральний. */
  color: string | null;
  wins: number;
  races: number;
  rounds: number;
  inProgress: boolean;
  /** Титул вирішено (у поточному сезоні може бути вирішено достроково). */
  decided: boolean;
  /** null — до 1958 Кубка конструкторів не було. */
  cup: null | { team: SeasonTeam; decided: boolean };
  photo: null | { src: string; srcSet: string; width: number; height: number; focus: string; credit: Credit; label: string };
};
export type SeasonDecade = {
  decade: number;
  seasons: number;
  /** Різних чемпіонів (вирішені титули). */
  champions: number;
  /** Рік сезону, що триває, або null. */
  running: number | null;
  /** Прізвища чемпіонів і лідера, від нових до старих, без повторів. */
  names: string[];
  cards: SeasonCard[];
};
export type SeasonsIndex = {
  facts: { seasons: number; champions: number; maxTitles: number; maxTitleHolders: string[] };
  /** Від нових до старих. */
  decades: SeasonDecade[];
  credits: { label: string; href: string; author: string; license: string }[];
};

function team(id: string): SeasonTeam {
  const t = teamsById.get(id);
  if (!t) throw new Error(`Команда ${id} є в f1.season_index, але не в curated/teams.json`);
  return { id, name: t.name };
}

/** Основні команди чемпіона: найбільше гонок; друга — лише якщо за неї не менше третини гонок сезону пілота (Фанхіо 1954). */
export function mainTeams(teams: { id: string; races: number }[]): string[] {
  const total = teams.reduce((n, t) => n + t.races, 0);
  return teams.filter((t, i) => i === 0 || t.races * 3 >= total).map((t) => t.id);
}

export async function getSeasonsIndex(locale: Locale): Promise<SeasonsIndex> {
  const rows = [...(await loadSeasons())].sort((a, b) => b.year - a.year);
  const credits: SeasonsIndex["credits"] = [];
  const surnameOf = (r: SeasonIndexRow) => splitName(driverName(r.driver!, r.forename!, r.surname!, locale), r.surname!)[1];

  const cards = rows.map((r): SeasonCard => {
    const c = curated[String(r.year)];
    const name = r.driver ? driverName(r.driver, r.forename!, r.surname!, locale) : null;
    // Кураторське фото — лише якщо на ньому чемпіон / лідер (у поточному сезоні лідер може змінитись).
    const own = !!(c && r.surname && c.driver.toLowerCase().endsWith(r.surname.toLowerCase()));
    let photo: SeasonCard["photo"] = null;
    if (own && c!.photo && c!.credit) {
      photo = { ...c!.photo, credit: c!.credit, label: `${r.year}: ${r.forename} ${r.surname}` };
    } else if (r.driver) {
      const p = driverPortrait(r.driver);
      const w = heroes[r.driver];
      if (p && w?.length)
        photo = {
          src: `/img/drivers/${r.driver}-420.webp`,
          srcSet: w.map((x, i) => `/img/drivers/${r.driver}-${i === 0 ? 420 : 640}.webp ${x}w`).join(", "),
          width: w[0]!,
          height: Math.floor((w[0]! * 5) / 4),
          focus: "50% 20%",
          credit: p.credit,
          label: `${r.year}: ${r.forename} ${r.surname}`,
        };
    }
    if (photo) credits.push({ label: photo.label, href: photo.credit.page, author: photo.credit.author, license: photo.credit.license });
    const ids = mainTeams(r.teams);
    return {
      year: r.year,
      driver: r.driver
        ? { id: r.driver, slug: driverSlug(r.driver), name: name!, initials: `${r.forename![0] ?? ""}${r.surname![0] ?? ""}`.toUpperCase() }
        : null,
      teams: ids.map(team),
      color: own ? c!.color : ((ids[0] && teamsById.get(ids[0])?.color) ?? null),
      wins: r.wins,
      races: r.races,
      rounds: r.rounds,
      inProgress: r.in_progress,
      decided: r.driver_decided,
      cup: r.cup_team ? { team: team(r.cup_team), decided: r.cup_decided } : null,
      photo,
    };
  });

  const titles = new Map<string, { n: number; surname: string }>();
  for (const r of rows)
    if (r.driver && r.driver_decided) {
      const e = titles.get(r.driver) ?? { n: 0, surname: surnameOf(r) };
      e.n++;
      titles.set(r.driver, e);
    }
  const maxTitles = Math.max(0, ...[...titles.values()].map((t) => t.n));

  const byDecade = new Map<number, SeasonIndexRow[]>();
  for (const r of rows) {
    const d = Math.floor(r.year / 10) * 10;
    byDecade.set(d, [...(byDecade.get(d) ?? []), r]);
  }
  const decades = [...byDecade.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, rs]): SeasonDecade => {
      const names: string[] = [];
      const seen = new Set<string>();
      for (const r of rs)
        if (r.driver && !seen.has(r.driver)) {
          seen.add(r.driver);
          names.push(surnameOf(r));
        }
      return {
        decade,
        seasons: rs.length,
        champions: new Set(rs.filter((r) => r.driver && r.driver_decided).map((r) => r.driver)).size,
        running: rs.find((r) => r.in_progress)?.year ?? null,
        names,
        cards: cards.filter((c) => Math.floor(c.year / 10) * 10 === decade),
      };
    });

  return {
    facts: {
      seasons: rows.length,
      champions: titles.size,
      maxTitles,
      maxTitleHolders: [...titles.values()].filter((t) => t.n === maxTitles).map((t) => t.surname),
    },
    decades,
    credits,
  };
}
