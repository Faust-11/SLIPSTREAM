// Дані розділу «Прогнози» (фаза 9c): етапи поточного сезону з дедлайнами, сітка пілотів і команди з числовими id бази
// (їх приймає play.save_prediction). Лише на сервері, під час збірки; дедлайн для показу — з розкладу календаря, але
// остаточний — play.deadline (його віддає /api/predictions, клієнт показує саме його).
import "server-only";
import type { Locale } from "@/i18n/config";
import { getCalendarPage, type CalendarCard, type RoundState } from "./calendar";
import { dbSelect, dbSelectAll } from "./db";
import { driverName, loadDriverIndex } from "./drivers";
import { once } from "./once";
import { curatedDrivers, curatedTeams } from "./teams";

/** Дедлайн вікенду — за 5 хвилин до старту головної кваліфікації (play.deadline, 0015). */
export const DEADLINE_LEAD_MS = 5 * 60_000;

export type PredictionRound = {
  round: number;
  gp: string;
  place: string;
  /** Дата гонки (YYYY-MM-DD) для підпису; null — невідома. */
  date: string | null;
  state: RoundState;
  /** ISO-момент закриття прогнозів за розкладом календаря; null — час кваліфікації ще не відомий (прогнози закриті). */
  deadlineAt: string | null;
  sprint: boolean;
};

export type PickDriver = {
  /** f1.drivers.id — те, що приймає save_prediction. */
  id: number;
  /** Прізвище мовою сторінки (для таблиць і підписів). */
  short: string;
  /** Повне ім'я мовою сторінки. */
  name: string;
  /** Три літери: код з бази або перші три літери прізвища. */
  code: string;
  number: number | null;
  /** Слаг команди (curated), її назва й колір для позначки. */
  team: string | null;
  teamName: string | null;
  color: string;
  /** Місце в чемпіонаті зараз (для «підставити за заліком»); null — без очок. */
  position: number | null;
};

/** Команда для «яка команда не фінішує»: id — f1.teams.id, який стоїть у результатах поточного сезону (саме з ним порівнює підрахунок). */
export type PickTeam = { id: number; slug: string; name: string; color: string };

export type PredictionsData = {
  /** Сезон календаря, з якого етапи (він же сезон прогнозу: `year` у запитах). Не плутати з сезоном результатів для команд. */
  season: number;
  rounds: PredictionRound[];
  drivers: PickDriver[];
  teams: PickTeam[];
};

type DriverIdRow = { id: number; ref: string };
type ResultRow = { driver_id: number; team_id: number; sessions: { type: string; rounds: { season_year: number; number: number } } };
type MetaRow = { current_season: number };
type GridTeamRow = { id: string; current_position: number | null; current_drivers: string[] };

/** Старт головної кваліфікації етапу: справжній час сесії Q1 (QB/QA — формати 1950–2000-х; поточні сезони мають Q1). */
export function deadlineOf(card: Pick<CalendarCard, "sessions">): string | null {
  const q = card.sessions.find((s) => s.kind === "Q1");
  if (!q?.at || !q.real) return null;
  const t = Date.parse(q.at);
  return Number.isFinite(t) ? new Date(t - DEADLINE_LEAD_MS).toISOString() : null;
}

/** Числові id пілотів сітки (f1.drivers) за ref з driver_index. */
async function driverIds(refs: string[]): Promise<Map<string, number>> {
  if (refs.length === 0) return new Map();
  const rows = await dbSelect<DriverIdRow>("drivers", `select=id,ref&ref=in.(${refs.map(encodeURIComponent).join(",")})`);
  return new Map(rows.map((r) => [r.ref, r.id]));
}

/**
 * Команда кожного пілота за останньою гонкою сезону, де він стартував: f1.results.team_id. Саме ці id порівнює
 * play.score_round з прогнозом «команда без фінішу», а слаг команди з team_index (родина: Red Bull, Racing Bulls…) — ні.
 * Фільтри PostgREST дублюємо тут: фікстура e2e віддає рядки без фільтрації. Порожньо (сезон ще без гонок) — порожня мапа.
 */
async function latestTeamIds(season: number): Promise<Map<number, number>> {
  let rows: ResultRow[];
  try {
    // Сторінками з перевіркою загальної кількості: PostgREST мовчки обрізає відповідь на max-rows (1000), а сезон — ≈ 500 рядків.
    rows = await dbSelectAll<ResultRow>(
      "results",
      "select=driver_id,team_id,sessions!inner(type,rounds!inner(season_year,number))" +
        `&sessions.type=eq.R&sessions.rounds.season_year=eq.${season}&order=session_id,driver_id`,
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("порожня відповідь")) return new Map();
    throw e;
  }
  const latest = new Map<number, { round: number; team: number }>();
  for (const r of rows) {
    if (r.sessions?.type !== "R" || r.sessions.rounds.season_year !== season) continue;
    const prev = latest.get(r.driver_id);
    if (!prev || r.sessions.rounds.number > prev.round) latest.set(r.driver_id, { round: r.sessions.rounds.number, team: r.team_id });
  }
  return new Map([...latest].map(([driver, v]) => [driver, v.team]));
}

/**
 * Сезон, з чиїх РЕЗУЛЬТАТІВ беремо команди пілотів, — останній сезон, де вони є (site_meta). Це НЕ сезон прогнозу: після
 * останнього етапу календар уже може бути наступного року (calendar_sessions), а site_meta ще минулого — сезон прогнозу
 * береться з календаря, з якого й етапи (рев'ю 21.11, A; інакше етапи 2027 йшли б із year=2026 → 409).
 */
const resultsSeason = once(() => dbSelect<MetaRow>("site_meta", "select=current_season").then((r) => r[0]!.current_season));

/**
 * Сітка поточного сезону — пілоти з team_index.current_drivers (так сайт визначає «поточних»). driver_index.current_team
 * ширший: туди потрапляє й той, хто виступав за команду раніше в сезоні (замір 20.11: 25 проти 22 — Окон, Цунода, Хіракава
 * вже не на сітці), а прогноз на когось поза сіткою не принесе очок. Мовонезалежна частина — один запит на процес.
 */
const loadGrid = once(async () => {
  const season = await resultsSeason();
  const teamRows = (await dbSelect<GridTeamRow>("team_index", "select=id,current_position,current_drivers")).filter((t) => t.current_position !== null);
  const slugOf = new Map(teamRows.flatMap((t) => t.current_drivers.map((ref) => [ref, t.id] as const)));
  const index = (await loadDriverIndex()).filter((r) => slugOf.has(r.id));
  const [ids, teamIds] = await Promise.all([driverIds(index.map((r) => r.id)), latestTeamIds(season)]);
  return { index, slugOf, ids, teamIds };
});

const teamsBySlug = new Map(curatedTeams.map((t) => [t.id, t]));

export async function getPredictionsData(locale: Locale): Promise<PredictionsData> {
  const [page, grid] = await Promise.all([getCalendarPage(locale), loadGrid()]);

  const rounds = page.cards.map(
    (c): PredictionRound => ({ round: c.round, gp: c.gp, place: c.place, date: c.date, state: c.state, deadlineAt: deadlineOf(c), sprint: c.sprint }),
  );

  const drivers: PickDriver[] = [];
  const teams = new Map<string, PickTeam>();
  for (const r of grid.index) {
    const id = grid.ids.get(r.id);
    // Пілота немає в f1.drivers (розсинхрон даних) — у форму не потрапляє: save_prediction відхилив би невідомий id.
    if (id === undefined) continue;
    const slug = grid.slugOf.get(r.id) ?? null;
    const team = slug ? teamsBySlug.get(slug) : undefined;
    drivers.push({
      id,
      // Прізвище мовою сторінки: кураторське (uk) або латиниця з бази — як у решті сайту.
      short: curatedDrivers[r.id]?.surname[locale] ?? r.surname,
      name: driverName(r.id, r.forename, r.surname, locale),
      code: (r.code ?? r.surname.slice(0, 3)).toUpperCase(),
      number: r.current_number,
      team: slug,
      teamName: team?.name ?? null,
      color: team?.color ?? "#767C8D",
      position: r.current_position,
    });
    const teamId = grid.teamIds.get(id);
    if (team && slug && teamId !== undefined && !teams.has(slug)) {
      teams.set(slug, { id: teamId, slug, name: team.name, color: team.color ?? "#767C8D" });
    }
  }
  // Порядок за чемпіонатом (без очок — в кінці, за прізвищем): так список пілотів у вибірі зручно гортати.
  drivers.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.short.localeCompare(b.short, "en"));
  return {
    season: page.season,
    rounds,
    drivers,
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}
