// Знімок (91 КБ) — лише на сервері: імпорт значення з клієнтського модуля = помилка збірки.
// Пакет не потрібен: Next підставляє власний server-only; у Vitest — аліас (vitest.config.mts).
import "server-only";
import snapshot from "@/data/snapshot/teams.json";
import type { Locale } from "@/i18n/config";
import type { Credit, TeamSnapshot, TeamsSnapshot } from "./types";

// JSON-імпорт TypeScript типізує ширше (number[][] замість кортежів, number замість 480) — приводимо
// через unknown; форму знімка гарантують тести інваріантів (`__tests__/teams-snapshot.test.ts`).
export const teamsSnapshot = snapshot as unknown as TeamsSnapshot;
const data = teamsSnapshot;

export const TEAMS_PAGE_SIZE = 24;

/** Поточний сезон — рік дати знімка (мітка «2026 · P1», «Пілоти 2026», фільтр «Сезон 2026»). */
export function getTeamsSeason(): number {
  return Number(data.asOf.slice(0, 4));
}

export type TeamCardDriver = { id: string; name: string; initials: string; avatar: string | null };

/** Картка команди мовою сторінки — те, що отримує UI. */
export type TeamCard = Omit<TeamSnapshot, "country" | "current" | "photo" | "fullName" | "refs"> & {
  country: string;
  current: null | { position: number; color: string; drivers: TeamCardDriver[] };
  photo: null | { src: string; width: number; height: number; alt: string };
  /** Рядок для пошуку (як data-k макета): назва, повна назва, код і країна обома мовами — нижній регістр. */
  search: string;
};

const ALT: Record<Locale, (name: string) => string> = {
  uk: (name) => `Болід ${name}`,
  en: (name) => `${name} car`,
};

function toCard(t: TeamSnapshot, locale: Locale): TeamCard {
  return {
    id: t.id,
    name: t.name,
    seasons: t.seasons,
    grandsPrix: t.grandsPrix,
    wins: t.wins,
    titles: t.titles,
    country: t.country[locale],
    countryCode: t.countryCode,
    current: t.current && {
      position: t.current.position,
      color: t.current.color,
      drivers: t.current.drivers.map((d) => ({ id: d.id, name: d.surname[locale], initials: d.initials, avatar: d.avatar })),
    },
    photo: t.photo && { src: t.photo.src, width: t.photo.width, height: t.photo.height, alt: ALT[locale](t.name) },
    search: [t.name, t.fullName, t.countryCode, t.country.en, t.country.uk].join(" ").toLowerCase(),
  };
}

/** Усі команди в порядку за замовчуванням (перемоги ↓, Гран-прі ↓). У фазі 2 — запит до бази. */
export async function getTeamsIndex(locale: Locale): Promise<TeamCard[]> {
  return data.teams.map((t) => toCard(t, locale));
}

/** Автори й ліцензії фото, показаних у розділі (для згорнутого переліку внизу сторінки). */
export async function getTeamsCredits(): Promise<{
  cars: (Credit & { team: string })[];
  avatars: (Credit & { driver: string })[];
}> {
  const cars = data.teams
    .filter((t) => t.photo)
    .map((t) => ({ team: t.name, ...t.photo!.credit }))
    .sort((a, b) => a.team.localeCompare(b.team, "en"));
  const names = new Map(data.teams.flatMap((t) => t.current?.drivers ?? []).map((d) => [d.id, d.name.en]));
  const avatars = Object.entries(data.avatarCredits)
    .map(([id, c]) => ({ driver: names.get(id) ?? id, ...c }))
    .sort((a, b) => a.driver.localeCompare(b.driver, "en"));
  return { cars, avatars };
}
