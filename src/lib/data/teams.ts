// Дані — лише на сервері: імпорт значення з клієнтського модуля = помилка збірки.
// Пакет не потрібен: Next підставляє власний server-only; у Vitest — аліас (vitest.config.mts).
import "server-only";
import curatedDriversJson from "@/data/curated/drivers.json";
import curatedTeamsJson from "@/data/curated/teams.json";
import snapshot from "@/data/snapshot/teams.json";
import type { Locale } from "@/i18n/config";
import { dbSelect } from "./db";
import type { Credit, CuratedDriver, CuratedTeam, SnapshotDriver, TeamIndexRow, TeamSnapshot, TeamsSnapshot } from "./types";

// JSON-імпорт TypeScript типізує ширше (number[][] замість кортежів, number замість 480) — приводимо
// через unknown; форму гарантують тести (`__tests__/teams-snapshot.test.ts`, `curated.test.ts`).
/** Знімок фази 3a — лише фікстура тестів паритету (дані сайту — з бази). */
export const teamsSnapshot = snapshot as unknown as TeamsSnapshot;
export const curatedTeams = (curatedTeamsJson as unknown as { teams: CuratedTeam[] }).teams;
export const curatedDrivers = (curatedDriversJson as unknown as { drivers: Record<string, CuratedDriver> }).drivers;

type SiteMetaRow = { current_season: number; last_round: number; last_race_date: string };
type DbDriverRow = { ref: string; forename: string; surname: string };

// Один запит на збірку: сторінки EN/UK і метадані беруть ті самі дані.
let indexPromise: Promise<TeamIndexRow[]> | undefined;
let metaPromise: Promise<SiteMetaRow> | undefined;
const loadIndex = () =>
  (indexPromise ??= dbSelect<TeamIndexRow>(
    "team_index",
    "select=id,seasons,grands_prix,wins,titles,current_position,current_drivers",
  ));
const loadMeta = () => (metaPromise ??= dbSelect<SiteMetaRow>("site_meta", "select=current_season,last_round,last_race_date").then((r) => r[0]!));

/** Пілот без кураторських даних (новачок посеред сезону) — латиниця з бази, ініціали, без фото. */
async function fallbackDrivers(refs: string[]): Promise<Record<string, CuratedDriver>> {
  if (refs.length === 0) return {};
  const rows = await dbSelect<DbDriverRow>("drivers", `select=ref,forename,surname&ref=in.(${refs.map(encodeURIComponent).join(",")})`);
  return Object.fromEntries(
    rows.map((d) => {
      const full = `${d.forename} ${d.surname}`;
      const initials = `${d.forename[0] ?? ""}${d.surname[0] ?? ""}`.toUpperCase();
      return [d.ref, { name: { en: full, uk: full }, surname: { en: d.surname, uk: d.surname }, initials, avatar: null, credit: null }];
    }),
  );
}

/** Команди з бази + кураторські дані, у формі знімка 3a (далі — та сама логіка карток). */
async function loadTeams(): Promise<TeamSnapshot[]> {
  const rows = await loadIndex();
  const byId = new Map(curatedTeams.map((t) => [t.id, t]));
  const missingDrivers = [...new Set(rows.flatMap((r) => r.current_drivers))].filter((ref) => !curatedDrivers[ref]);
  const drivers = { ...(await fallbackDrivers(missingDrivers)), ...curatedDrivers };
  const teams = rows.map((r): TeamSnapshot => {
    const c = byId.get(r.id);
    if (!c) throw new Error(`Команда ${r.id} є в базі, але не в src/data/curated/teams.json`);
    const current =
      r.current_position === null
        ? null
        : {
            position: r.current_position,
            color: c.color ?? "#767C8D",
            drivers: r.current_drivers.map((ref): SnapshotDriver => {
              const d = drivers[ref];
              if (!d) throw new Error(`Пілот ${ref} — немає ні в кураторських даних, ні в базі`);
              return { id: ref, name: d.name, surname: d.surname, initials: d.initials, avatar: d.avatar };
            }),
          };
    return {
      id: c.id,
      name: c.name,
      fullName: c.fullName,
      aliases: c.aliases,
      refs: c.refs,
      country: c.country,
      countryCode: c.countryCode,
      seasons: r.seasons,
      grandsPrix: r.grands_prix,
      wins: r.wins,
      titles: r.titles,
      current,
      photo: c.photo,
    };
  });
  // Порядок за замовчуванням, як у макеті: перемоги ↓, Гран-прі ↓ (далі — назва, щоб не залежати від бази).
  return teams.sort((a, b) => b.wins - a.wins || b.grandsPrix - a.grandsPrix || a.name.localeCompare(b.name, "en"));
}

export const TEAMS_PAGE_SIZE = 24;

/** Поточний сезон — сезон останньої гонки з результатами (мітка «2026 · P1», «Пілоти 2026», фільтр). */
export async function getTeamsSeason(): Promise<number> {
  return (await loadMeta()).current_season;
}

export type TeamCardDriver = { id: string; name: string; initials: string; avatar: string | null };

/** Картка команди мовою сторінки — те, що отримує UI. */
export type TeamCard = Omit<TeamSnapshot, "country" | "current" | "photo" | "fullName" | "refs" | "aliases"> & {
  country: string;
  current: null | { position: number; color: string; drivers: TeamCardDriver[] };
  photo: null | { src: string; srcSet: string; width: number; height: number; alt: string };
  /** Рядок для пошуку: назва, повна назва, кирилиця, код і країна обома мовами, пілоти сезону обома мовами — нижній регістр. */
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
    photo: t.photo && {
      src: t.photo.src,
      srcSet: t.photo.srcSet,
      width: t.photo.width,
      height: t.photo.height,
      alt: ALT[locale](t.name),
    },
    search: [
      t.name,
      t.fullName,
      ...t.aliases,
      t.countryCode,
      t.country.en,
      t.country.uk,
      ...(t.current?.drivers ?? []).flatMap((d) => [d.name.en, d.name.uk]),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

/** Усі команди в порядку за замовчуванням (перемоги ↓, Гран-прі ↓): числа — з бази, решта — кураторські дані. */
export async function getTeamsIndex(locale: Locale): Promise<TeamCard[]> {
  return (await loadTeams()).map((t) => toCard(t, locale));
}

/** Автори й ліцензії фото, показаних у розділі (для згорнутого переліку внизу сторінки). */
export async function getTeamsCredits(): Promise<{
  cars: (Credit & { team: string })[];
  avatars: (Credit & { driver: string })[];
}> {
  const teams = await loadTeams();
  const cars = teams
    .filter((t) => t.photo)
    .map((t) => ({ team: t.name, ...t.photo!.credit }))
    .sort((a, b) => a.team.localeCompare(b.team, "en"));
  // Лише показані портрети: пілоти поточних складів, у яких є фото й атрибуція.
  const avatars = teams
    .flatMap((t) => t.current?.drivers ?? [])
    .flatMap((d) => {
      const credit = d.avatar ? curatedDrivers[d.id]?.credit : null;
      return credit ? [{ driver: d.name.en, ...credit }] : [];
    })
    .sort((a, b) => a.driver.localeCompare(b.driver, "en"));
  return { cars, avatars };
}
