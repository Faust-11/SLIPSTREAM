// Список пілотів: числа — з подання f1.driver_index (0007), імена й портрети — src/data/curated. Лише на сервері.
import "server-only";
import driverNamesJson from "@/data/curated/driver-names.json";
import driverPortraitsJson from "@/data/curated/driver-portraits.json";
import type { Locale } from "@/i18n/config";
import { normalizeSearch } from "@/lib/teams-list";
import { dbSelectAll } from "./db";
import { once } from "./once";
import { curatedDrivers, curatedTeams } from "./teams";
import type { Credit, DriverIndexRow, L10n } from "./types";

type NameEntry = L10n & { manual?: { uk: string } };
type PortraitEntry = { avatar?: string; credit?: Credit; manual?: { avatar: string; credit: Credit } };
const driverNames = (driverNamesJson as unknown as { drivers: Record<string, NameEntry> }).drivers;
const portraits = (driverPortraitsJson as unknown as { drivers: Record<string, PortraitEntry> }).drivers;
const teamsById = new Map(curatedTeams.map((t) => [t.id, t]));

const loadIndex = once(() =>
  dbSelectAll<DriverIndexRow>(
    "driver_index",
    "select=id,forename,surname,code,country_code,nationality,starts,wins,podiums,poles,titles,title_years,y0,y1,seasons," +
      "main_team,current_team,current_number,current_position,current_points&order=id",
  ),
);

/** Ім'я мовою сторінки: кураторські → ручні/Wikidata → латиниця з бази. */
export function driverName(id: string, forename: string, surname: string, locale: Locale): string {
  const c = curatedDrivers[id];
  if (c) return c.name[locale];
  const n = driverNames[id];
  const latin = `${forename} ${surname}`;
  if (locale === "uk") return n?.manual?.uk ?? n?.uk ?? latin;
  return n?.en ?? latin;
}

/** Портрет: кураторський (з фото команди) → ручний (адмінка) → макет / Wikidata. */
export function driverPortrait(id: string): { avatar: string; credit: Credit } | null {
  const c = curatedDrivers[id];
  if (c?.avatar && c.credit) return { avatar: c.avatar, credit: c.credit };
  const p = portraits[id];
  if (p?.manual) return p.manual;
  return p?.avatar && p.credit ? { avatar: p.avatar, credit: p.credit } : null;
}

export type DriverRow = {
  id: string;
  name: string;
  /** Ім'я іншою мовою — для пошуку обома мовами. */
  alt: string;
  /** Латиниця — для пошуку й сортування за прізвищем незалежно від мови. */
  latin: string;
  surname: string;
  initials: string;
  avatar: string | null;
  countryCode: string | null;
  team: string | null;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  titles: number;
  years: [number, number];
  current: null | { position: number | null; points: number; team: string | null; color: string; number: number | null };
  /** Нижній регістр: ім'я обома мовами, латиниця, код країни, основна команда. */
  search: string;
};

export async function getDriversIndex(locale: Locale): Promise<DriverRow[]> {
  const rows = await loadIndex();
  return rows.map((r) => {
    const name = driverName(r.id, r.forename, r.surname, locale);
    const other = driverName(r.id, r.forename, r.surname, locale === "uk" ? "en" : "uk");
    const team = r.main_team ? (teamsById.get(r.main_team)?.name ?? null) : null;
    const cur = r.current_team ? teamsById.get(r.current_team) : undefined;
    const p = driverPortrait(r.id);
    return {
      id: r.id,
      name,
      alt: other,
      latin: `${r.forename} ${r.surname}`,
      surname: r.surname,
      initials: `${r.forename[0] ?? ""}${r.surname[0] ?? ""}`.toUpperCase(),
      avatar: p?.avatar ?? null,
      countryCode: r.country_code,
      team,
      starts: r.starts,
      wins: r.wins,
      podiums: r.podiums,
      poles: r.poles,
      titles: r.titles,
      years: [r.y0, r.y1],
      current: r.current_team
        ? {
            position: r.current_position,
            points: r.current_points ?? 0,
            team: cur?.name ?? null,
            color: cur?.color ?? "#767C8D",
            number: r.current_number,
          }
        : null,
      search: normalizeSearch([name, other, `${r.forename} ${r.surname}`, r.country_code ?? "", team ?? ""].join(" ")),
    };
  });
}

/** Автори й ліцензії показаних портретів. */
export async function getDriversCredits(): Promise<{ driver: string; page: string; author: string; license: string }[]> {
  const rows = await loadIndex();
  return rows
    .map((r) => ({ r, p: driverPortrait(r.id) }))
    .filter((x) => x.p)
    .map(({ r, p }) => ({ driver: `${r.forename} ${r.surname}`, ...p!.credit }))
    .sort((a, b) => a.driver.localeCompare(b.driver, "en"));
}

/**
 * Компактний рядок для клієнта (таблиця на ~800 пілотів): масив замість об'єкта з довгими ключами —
 * у RSC-пейлоаді сторінки 759 КБ → у рази менше (замір 12.11). Розгортає `expandDriver` у браузері.
 * [id, ім'я, ім'я іншою мовою, латиниця, прізвище, шлях портрета або "", код країни, команда, старти, перемоги, подіуми,
 *  поули, титули, рік від, рік до, поточний сезон: [місце, очки, команда, колір, номер] | 0]
 */
export type PackedDriver = [
  string, string, string, string, string, string, string, string, number, number, number, number, number, number, number,
  0 | [number | null, number, string | null, string, number | null],
];

export function packDriver(r: DriverRow): PackedDriver {
  return [
    r.id, r.name, r.alt, r.latin, r.surname, r.avatar ?? "", r.countryCode ?? "", r.team ?? "",
    r.starts, r.wins, r.podiums, r.poles, r.titles, r.years[0], r.years[1],
    r.current ? [r.current.position, r.current.points, r.current.team, r.current.color, r.current.number] : 0,
  ];
}
