import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import racePhotosJson from "@/data/curated/race-photos.json";
import seasonsJson from "@/data/curated/seasons.json";
import teamsJson from "@/data/curated/teams.json";
import { getCalendarPage } from "@/lib/data/calendar";
import { getCircuitRefs } from "@/lib/data/circuits";
import { driverHeroCredit, getDriversIndex } from "@/lib/data/drivers";
import type { Credit } from "@/lib/data/types";
import type { Part, Target } from "./slots";

/**
 * Каталог фото для адмінки: усе, що має фото на сайті, з поточним фото й автором, і черга «без фото» за важливістю
 * (як у макеті: чемпіони → переможці → призери → за кількістю стартів). Дані — ті самі, що бачить сайт (збірка/база).
 */
export type Kind = "driver" | "team" | "season" | "circuit" | "race";
export const KINDS: { kind: Kind; label: string }[] = [
  { kind: "driver", label: "Пілоти" },
  { kind: "team", label: "Команди" },
  { kind: "season", label: "Сезони" },
  { kind: "circuit", label: "Траси" },
  { kind: "race", label: "Гонки" },
];

export type Item = {
  kind: Kind;
  id: string;
  name: string;
  /** Підпис у черзі: «чемпіон світу · 1952–1958», «11 гонок · 1950–1966». */
  note: string;
  /** Поточні фото (картка/аватар і банер), з авторами. */
  card: { src: string; credit: Credit | null } | null;
  hero: { src: string; credit: Credit | null } | null;
  /** Чи має пара (картка + банер) — тоді в адмінці вибір «обидва / лише одне». */
  paired: boolean;
  /** Для сортування черги: більше — важливіше. */
  weight: number;
};

type CuratedTeam = { id: string; name: string; photo?: { src: string; credit: Credit }; hero?: { src: string; credit?: Credit } };
type CuratedSeason = { driver: string; credit?: Credit; photo?: { src: string }; hero?: { src: string; credit?: Credit } };
type CuratedPlace = { uk: string; credit?: Credit; hero?: { src: string; credit?: Credit } };
type RacePhoto = { src: string; credit: Credit };

const teams = (teamsJson as unknown as { teams: CuratedTeam[] }).teams;
const seasons = (seasonsJson as unknown as { seasons: Record<string, CuratedSeason> }).seasons;
const places = (circuitsJson as unknown as { places: Record<string, CuratedPlace> }).places;
const racePhotos = (racePhotosJson as unknown as { photos: Record<string, RacePhoto> }).photos;

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};

export async function catalog(kind: Kind): Promise<Item[]> {
  switch (kind) {
    case "driver": {
      const rows = await getDriversIndex("uk");
      return rows.map((d) => {
        const hero = `/img/drivers/${d.id}-420.webp`;
        const note =
          d.titles > 0
            ? `чемпіон світу · ${d.years[0]}–${d.years[1]}`
            : d.wins > 0
              ? `${plural(d.wins, "перемога", "перемоги", "перемог")} · ${d.years[0]}–${d.years[1]}`
              : `${plural(d.starts, "старт", "старти", "стартів")} · ${d.years[0]}–${d.years[1]}`;
        return {
          kind,
          id: d.id,
          name: d.name,
          note,
          card: d.avatar ? { src: d.avatar, credit: null } : null,
          hero: d.avatar ? { src: hero, credit: driverHeroCredit(d.id) } : null,
          paired: true,
          // Чемпіони ≫ переможці ≫ призери ≫ старти.
          weight: d.titles * 1e9 + d.wins * 1e6 + d.podiums * 1e3 + d.starts,
        };
      });
    }
    case "team":
      return teams.map((t) => ({
        kind,
        id: t.id,
        name: t.name,
        note: t.id,
        card: t.photo ? { src: t.photo.src, credit: t.photo.credit } : null,
        hero: t.hero ? { src: t.hero.src, credit: t.hero.credit ?? t.photo?.credit ?? null } : null,
        paired: true,
        weight: 0,
      }));
    case "season":
      return Object.entries(seasons)
        .map(([year, s]) => ({
          kind,
          id: year,
          name: year,
          note: `чемпіон — ${s.driver}`,
          card: s.photo ? { src: s.photo.src, credit: s.credit ?? null } : null,
          hero: s.hero ? { src: s.hero.src, credit: s.hero.credit ?? s.credit ?? null } : null,
          paired: true,
          weight: Number(year),
        }))
        .sort((a, b) => b.weight - a.weight);
    case "circuit": {
      const refs = await getCircuitRefs();
      return refs.map((ref) => {
        const p = places[ref];
        return {
          kind,
          id: ref,
          name: p?.uk ?? ref,
          note: ref,
          card: null,
          hero: p?.hero ? { src: p.hero.src, credit: p.hero.credit ?? p.credit ?? null } : null,
          paired: false,
          weight: 0,
        };
      });
    }
    case "race": {
      const cal = await getCalendarPage("uk");
      return cal.cards.map((c) => {
        const key = `${cal.season}/${c.round}`;
        const own = racePhotos[key];
        return {
          kind,
          id: `${cal.season}-${c.round}`,
          name: c.gp,
          note: `${cal.season} · етап ${c.round}${own ? "" : " · фото траси"}`,
          card: null,
          hero: own ? { src: own.src, credit: own.credit } : null,
          paired: false,
          weight: -c.round,
        };
      });
    }
  }
}

/** Черга: без фото, за важливістю. */
export function queue(items: Item[], limit = 40): Item[] {
  return items
    .filter((i) => !(i.card ?? i.hero))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** Адреса /admin/photos/<kind>/<id> → ціль слоту (перевірка — у formatsFor). */
export function targetOf(kind: string, id: string, part: Part): Target | null {
  switch (kind) {
    case "driver":
      return { kind, ref: id, part };
    case "team":
      return { kind, id, part };
    case "season":
      return { kind, year: id, part };
    case "circuit":
      return { kind, ref: id };
    case "race": {
      const m = /^(\d{4})-(\d{1,2})$/.exec(id);
      return m ? { kind, key: `${m[1]}/${m[2]}` } : null;
    }
    default:
      return null;
  }
}

export async function findItem(kind: Kind, id: string): Promise<Item | null> {
  return (await catalog(kind)).find((i) => i.id === id) ?? null;
}
