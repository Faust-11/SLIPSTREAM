// Сторінка сезону /seasons/<рік> (фаза 3f): числа — з f1.season_rounds / season_points / season_rules (0011),
// f1.driver_seasons, f1.team_seasons, f1.season_index; фото — src/data/curated/seasons.json; місця етапів — circuits.json.
// Обчислення (правило заліку, вирішальний етап, половина очок, лідери) — src/lib/season-math.ts. Лише на сервері.
import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import driverHeroesJson from "@/data/curated/driver-heroes.json";
import seasonsJson from "@/data/curated/seasons.json";
import type { Locale } from "@/i18n/config";
import { driverSlug } from "@/lib/driver-slug";
import {
  decidingRound,
  halfPointRounds,
  jolpicaRule,
  leadersByRound,
  leadSpells,
  maxDeficit,
  observedMax,
  seasonRules,
  type SeasonData,
} from "@/lib/season-math";
import { dbSelectAll } from "./db";
import { loadDriverSeasons, splitName } from "./driver-page";
import { driverName, driverPortrait, loadDriverIndex } from "./drivers";
import { once } from "./once";
import { loadSeasonIndex, mainTeams } from "./seasons";
import { gpName, loadTeamSeasons } from "./team-page";
import { curatedDrivers, curatedTeams } from "./teams";
import type { Credit, DriverIndexRow, L10n, SeasonPointsDbRow, SeasonPoleWho, SeasonRoundRow, SeasonRuleRow } from "./types";

type CuratedSeason = {
  driverRef?: string;
  color: string;
  photo?: { src: string; srcSet: string; width: number; height: number };
  hero?: { src: string; srcSet: string; width: number; height: number; focusY?: number };
  credit?: Credit;
};
const curatedSeasons = (seasonsJson as unknown as { seasons: Record<string, CuratedSeason> }).seasons;
const places = (circuitsJson as unknown as { places: Record<string, L10n> }).places;
const heroes = (driverHeroesJson as unknown as { drivers: Record<string, number[]> }).drivers;
const teamsById = new Map(curatedTeams.map((t) => [t.id, t]));

/** Ліній на графіку: перші 4 фінального заліку + усі, хто очолював залік хоч після одного етапу. */
export const CHART_TOP = 4;
/** Слотів у палітрі графіка (season.css --s0…--s5, штрихи DASH); більше ліній — слоти по колу (у даних максимум 6). */
export const PALETTE_SLOTS = 6;
/** Найменша ширина джерела банера (px). */
export const HERO_MIN_WIDTH = 960;

const byYear = <T extends { year: number }>(rows: T[]) => {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const list = m.get(r.year);
    if (list) list.push(r);
    else m.set(r.year, [r]);
  }
  return m;
};
const loadRounds = once(async () =>
  byYear(
    await dbSelectAll<SeasonRoundRow>(
      "season_rounds",
      "select=year,round,name,date,cancelled,circuit,locality,country,sprint,winners,winner_points,poles,sprint_winners,disqualified" +
        "&order=year,round.nullslast,name",
    ),
  ),
);
const loadPoints = once(async () =>
  byYear(
    await dbSelectAll<SeasonPointsDbRow>(
      "season_points",
      "select=year,round,driver,race_points,sprint_points,place,standing,standing_points&order=year,round,driver",
    ),
  ),
);
const loadRules = once(async () =>
  new Map((await dbSelectAll<SeasonRuleRow>("season_rules", "select=year,driver_best_results,driver_season_split&order=year")).map((r) => [r.year, r])),
);
const loadNames = once(async () => new Map((await loadDriverIndex()).map((r) => [r.id, r])));

/* ---------- типи сторінки ---------- */

export type SeasonTeamRef = { id: string; name: string; color: string | null };
export type SeasonDriver = {
  id: string;
  slug: string;
  name: string;
  /** Прізвище (для підписів графіка й текстів). */
  short: string;
  initials: string;
  /** Малий портрет (96 px) або null. */
  avatar: string | null;
};
export type SeasonPhoto = { src: string; srcSet: string; width: number; height: number; focus?: string; credit: Credit; label: string };
export type Neighbour = { year: number; champion: string | null; inProgress: boolean; photo: SeasonPhoto | null };
export type ChartLine = {
  driver: SeasonDriver;
  /** Позиція в палітрі графіка (0 — чемпіон / лідер). */
  slot: number;
  /** Очки після кожного етапу з заліком (індекс — як у chart.rounds). */
  points: number[];
  final: number;
};
export type Contender = {
  position: number;
  driver: SeasonDriver;
  team: SeasonTeamRef | null;
  number: number | null;
  /** Фото 4:5 (портрет пілота) або null — тоді колір команди з номером. */
  photo: SeasonPhoto | null;
  points: number;
  /** Відставання від першого (0 у першого). */
  gap: number;
  wins: number;
  poles: number;
  podiums: number;
  slot: number | null;
};
export type CalendarRound = {
  round: number | null;
  date: string | null;
  place: string;
  gp: string;
  sprint: boolean;
  cancelled: boolean;
  /** Етап уже відбувся (є переможець гонки). */
  done: boolean;
  winners: (SeasonDriver & { team: SeasonTeamRef | null })[];
  /** Машини з поулом (у кожної — екіпаж: у 1950-х машину ділили кілька пілотів). */
  poles: SeasonDriver[][];
  sprintWinners: SeasonDriver[];
  /** Колір смуги — позиція переможця в палітрі графіка (пілот з лінією) або null. */
  slot: number | null;
  /** Після цього етапу титул недосяжний для суперників (season-math.decidingRound). */
  decider: boolean;
  /** Нараховано половину очок. */
  half: boolean;
  /** Дискваліфіковані претенденти (перша трійка фінального заліку). */
  disqualified: SeasonDriver[];
};
export type StandingRow = {
  position: number | null;
  driver: SeasonDriver;
  team: SeasonTeamRef | null;
  points: number;
  excluded: boolean;
  slot: number | null;
};
export type TeamStandingRow = { position: number | null; team: SeasonTeamRef; points: number; excluded: boolean };

export type SeasonFacts = {
  /** Відрив першого від другого (фінальний або поточний). */
  margin: null | { first: SeasonDriver; second: SeasonDriver; points: number };
  spells: { driver: SeasonDriver; from: number; to: number }[];
  /** Найбільше відставання від лідера заліку серед перших двох фінального заліку (і що було далі). */
  deficit: null | { driver: SeasonDriver; round: number; place: string; points: number; winsAfter: number; racesAfter: number; champion: boolean };
  disqualified: { round: number; place: string; drivers: SeasonDriver[]; winner: SeasonDriver | null }[];
  /** Зараховувались не всі результати, і це змінило переможця: суперник набрав більше загалом. */
  dropped: null | { champion: SeasonDriver; championTotal: number; championCounted: number; rival: SeasonDriver; rivalTotal: number; rivalCounted: number };
  decider: null | { round: number; place: string; gp: string; last: boolean };
  /** Виключені з підсумкового заліку (Шумахер 1997) — з очками, набраними в сезоні. */
  excluded: { driver: SeasonDriver; points: number }[];
};

export type SeasonPage = {
  year: number;
  inProgress: boolean;
  /** Титул вирішено (у поточному сезоні — достроково). */
  decided: boolean;
  races: number;
  rounds: number;
  champion: SeasonDriver | null;
  championTeams: SeasonTeamRef[];
  cup: null | { team: SeasonTeamRef; decided: boolean };
  hero: { photo: SeasonPhoto | null; color: string | null };
  keys: { races: number; sprints: number; winners: number; margin: number | null; teamWins: null | { team: SeasonTeamRef; wins: number } };
  chart: { rounds: { round: number; place: string }[]; lines: ChartLine[]; leaders: (number | null)[] };
  facts: SeasonFacts;
  contenders: Contender[];
  calendar: CalendarRound[];
  drivers: StandingRow[];
  /** null — до 1958 Кубка конструкторів не було. */
  teams: TeamStandingRow[] | null;
  prev: Neighbour | null;
  next: Neighbour | null;
  credits: { label: string; href: string; author: string; license: string }[];
};

/* ---------- допоміжне ---------- */

function teamRef(id: string | undefined | null): SeasonTeamRef | null {
  if (!id) return null;
  const t = teamsById.get(id);
  if (!t) throw new Error(`Команда ${id} є в базі, але не в curated/teams.json`);
  return { id, name: t.name, color: t.color };
}

/**
 * Поул по машинах: записи з grid = 1 (у порядку бази) групуються за номером машини; машину, де вже є пілот із
 * попередньої, відкидаємо (1964 Італія: Кларк на №1 і на №2 з Спенсом — поул один, Кларка). Різні машини з grid = 1
 * (1952 Італія: Аскарі й Мосс) — помилка даних Jolpica, показуємо як є (docs/data/review-…-circuit-places.md).
 */
export function poleCars(poles: SeasonPoleWho[]): string[][] {
  const cars = new Map<string, string[]>();
  for (const p of poles) {
    const k = p.car === null ? `?${p.driver}` : String(p.car);
    const list = cars.get(k);
    if (list) {
      if (!list.includes(p.driver)) list.push(p.driver);
    } else cars.set(k, [p.driver]);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const crew of cars.values()) {
    if (crew.some((d) => seen.has(d))) continue;
    crew.forEach((d) => seen.add(d));
    out.push(crew);
  }
  return out;
}

/** Місце етапу мовою сторінки: circuits.json → locality з бази. */
export function placeName(circuit: string | null, locality: string | null, locale: Locale): string {
  const p = circuit ? places[circuit] : undefined;
  return p?.[locale] ?? locality ?? "—";
}

function makeDriver(id: string, names: Map<string, DriverIndexRow>, locale: Locale): SeasonDriver {
  const r = names.get(id);
  const forename = r?.forename ?? "";
  const surname = r?.surname ?? id;
  const name = driverName(id, forename, surname, locale);
  return {
    id,
    slug: driverSlug(id),
    name,
    short: splitName(name, surname)[1],
    initials: curatedDrivers[id]?.initials ?? `${forename[0] ?? ""}${surname[0] ?? ""}`.toUpperCase(),
    avatar: driverPortrait(id)?.avatar ?? null,
  };
}

function bigPortrait(id: string, label: string): SeasonPhoto | null {
  const p = driverPortrait(id);
  const w = heroes[id];
  if (!p || !w?.length) return null;
  return {
    src: `/img/drivers/${id}-420.webp`,
    srcSet: w.map((x, i) => `/img/drivers/${id}-${i === 0 ? 420 : 640}.webp ${x}w`).join(", "),
    width: w[0]!,
    height: Math.floor((w[0]! * 5) / 4),
    focus: "50% 20%",
    credit: p.credit,
    label,
  };
}

/** Фото сезону (квадрат картки списку) — лише якщо на ньому чемпіон / лідер. */
function seasonCardPhoto(year: number, driver: string | null): SeasonPhoto | null {
  const c = curatedSeasons[String(year)];
  if (!c?.photo || !c.credit || !driver || c.driverRef !== driver) return null;
  return { ...c.photo, credit: c.credit, label: String(year) };
}

export async function getSeasonYears(): Promise<number[]> {
  return (await loadSeasonIndex()).map((r) => r.year);
}

export async function getSeasonPage(year: number, locale: Locale): Promise<SeasonPage | null> {
  const [index, roundsBy, pointsBy, rules, names, driverSeasons, teamSeasons] = await Promise.all([
    loadSeasonIndex(),
    loadRounds(),
    loadPoints(),
    loadRules(),
    loadNames(),
    loadDriverSeasons(),
    loadTeamSeasons(),
  ]);
  const si = index.find((r) => r.year === year);
  if (!si) return null;
  const drv = (id: string) => makeDriver(id, names, locale);
  const allRounds = roundsBy.get(year) ?? [];
  const rounds = allRounds.filter((r) => r.round !== null && !r.cancelled).sort((a, b) => a.round! - b.round!);
  const points = pointsBy.get(year) ?? [];

  /* --- залік пілотів сезону (driver_seasons: місце й очки — офіційні) --- */
  const seasonRows = [...driverSeasons.values()].flat().filter((r) => r.year === year && (r.position !== null || r.excluded));
  seasonRows.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (b.points ?? 0) - (a.points ?? 0));
  const standingIds = seasonRows.map((r) => r.id);

  /* --- лінії графіка: перші CHART_TOP + усі лідери --- */
  const leaders = leadersByRound(points);
  const lineIds = [...new Set([...standingIds.slice(0, CHART_TOP), ...leaders.map((l) => l.driver)])];
  // Порядок ліній — за фінальним заліком (виключені — за очками), лідери поза заліком — наприкінці.
  lineIds.sort((a, b) => {
    const ia = standingIds.indexOf(a);
    const ib = standingIds.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const slotOf = new Map(lineIds.map((id, i) => [id, i % PALETTE_SLOTS]));
  const doneRounds = [...new Set(points.filter((p) => p.standing_points !== null).map((p) => p.round))].sort((a, b) => a - b);
  const placeOf = new Map(rounds.map((r) => [r.round!, placeName(r.circuit, r.locality, locale)]));
  const lines: ChartLine[] = lineIds.map((id) => {
    const mine = new Map(points.filter((p) => p.driver === id && p.standing_points !== null).map((p) => [p.round, p.standing_points!]));
    let prev = 0;
    const pts = doneRounds.map((r) => (prev = mine.get(r) ?? prev));
    return { driver: drv(id), slot: slotOf.get(id)!, points: pts, final: pts.at(-1) ?? 0 };
  });
  const leaderByRound = new Map(leaders.map((l) => [l.round, l.driver]));

  /* --- вирішальний етап (лише коли висновок однозначний; поточний сезон — лише якщо титул вирішено) --- */
  const data: SeasonData = { rounds: rounds.map((r) => r.round!), sprintRounds: new Set(rounds.filter((r) => r.sprint).map((r) => r.round!)), rows: points };
  const rule = rules.get(year);
  const jr = rule ? jolpicaRule(rule.driver_best_results, rule.driver_season_split, rounds.length) : null;
  const obs = observedMax(points);
  // Поточний сезон: як v_current_season (0005) — не менше 26 за гонку й 8 за спринт, щоб не оголосити титул раніше бази.
  const max = si.in_progress ? { race: Math.max(obs.race, 26), sprint: Math.max(obs.sprint, 8) } : obs;
  const decision = !si.in_progress || si.driver_decided ? decidingRound(data, seasonRules(data, jr), max) : null;
  const half = halfPointRounds(rounds);

  /* --- календар --- */
  const top3 = new Set(standingIds.slice(0, 3));
  const calendar: CalendarRound[] = allRounds
    .slice()
    // За датою: скасований етап без номера стає на своє місце в сезоні (2026 — Саудівська Аравія у квітні), а не в кінець.
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.round ?? 999) - (b.round ?? 999))
    .map((r) => {
      const winners = (r.winners ?? []).map((w) => ({ ...drv(w.driver), team: teamRef(w.team) }));
      return {
        round: r.round,
        date: r.date,
        place: placeName(r.circuit, r.locality, locale),
        gp: gpName(r.name, locale),
        sprint: r.sprint,
        cancelled: r.cancelled,
        done: winners.length > 0,
        winners,
        poles: poleCars(r.poles ?? []).map((car) => car.map(drv)),
        sprintWinners: (r.sprint_winners ?? []).map((w) => drv(w.driver)),
        slot: winners.length === 1 ? (slotOf.get(winners[0]!.id) ?? null) : null,
        decider: decision !== null && r.round === decision.round,
        half: r.round !== null && half.has(r.round),
        disqualified: r.disqualified.filter((d) => top3.has(d)).map(drv),
      };
    });

  /* --- таблиці --- */
  const drivers: StandingRow[] = seasonRows.map((r) => ({
    position: r.position,
    driver: drv(r.id),
    team: teamRef(mainTeams(r.teams)[0]),
    points: r.points ?? 0,
    excluded: r.excluded,
    slot: slotOf.get(r.id) ?? null,
  }));
  const teams: TeamStandingRow[] | null =
    year < 1958
      ? null
      : [...teamSeasons.values()]
          .flat()
          .filter((r) => r.year === year && (r.position !== null || r.excluded))
          .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (b.points ?? 0) - (a.points ?? 0))
          .map((r) => ({ position: r.position, team: teamRef(r.id)!, points: r.points ?? 0, excluded: r.excluded }));

  /* --- претенденти --- */
  const ranked = seasonRows.filter((r) => r.position !== null);
  const leaderPts = ranked[0]?.points ?? 0;
  const contenders: Contender[] = ranked.slice(0, 3).map((r) => ({
    position: r.position!,
    driver: drv(r.id),
    team: teamRef(mainTeams(r.teams)[0]),
    number: r.numbers[0] ?? null,
    photo: bigPortrait(r.id, `${year}: ${drv(r.id).name}`),
    points: r.points ?? 0,
    gap: leaderPts - (r.points ?? 0),
    wins: r.wins,
    poles: r.poles,
    podiums: r.podiums,
    slot: slotOf.get(r.id) ?? null,
  }));

  /* --- ключові числа --- */
  const winnerIds = new Set(calendar.flatMap((c) => c.winners.map((w) => w.id)));
  const champTeams = si.driver ? mainTeams(si.teams).map((id) => teamRef(id)!) : [];
  const teamWins = champTeams[0]
    ? { team: champTeams[0], wins: calendar.filter((c) => c.winners.some((w) => w.team?.id === champTeams[0]!.id)).length }
    : null;
  const margin = ranked.length >= 2 ? (ranked[0]!.points ?? 0) - (ranked[1]!.points ?? 0) : null;

  /* --- факти для текстів --- */
  const champion = si.driver ? drv(si.driver) : null;
  const facts: SeasonFacts = {
    margin: ranked.length >= 2 ? { first: drv(ranked[0]!.id), second: drv(ranked[1]!.id), points: margin! } : null,
    spells: leadSpells(leaders).map((s) => ({ driver: drv(s.driver), from: s.from, to: s.to })),
    deficit: null,
    disqualified: calendar
      .filter((c) => c.round !== null && c.disqualified.length > 0)
      .map((c) => ({ round: c.round!, place: c.place, drivers: c.disqualified, winner: c.winners[0] ?? null })),
    dropped: null,
    excluded: seasonRows.filter((r) => r.excluded).map((r) => ({ driver: drv(r.id), points: r.points ?? 0 })),
    decider: decision
      ? {
          round: decision.round,
          place: placeOf.get(decision.round) ?? "—",
          gp: gpName(rounds.find((r) => r.round === decision.round)!.name, locale),
          last: decision.round === rounds.at(-1)?.round,
        }
      : null,
  };
  // Відставання: найбільше серед перших двох (макет 2025: Ферстаппен −104 після Зандворта, потім 6 перемог з 9).
  const deficits = [ranked[0]?.id, ranked[1]?.id]
    .filter((id): id is string => !!id)
    .map((id) => ({ id, d: maxDeficit(points, id) }))
    .filter((x): x is { id: string; d: { round: number; points: number } } => x.d !== null)
    .sort((a, b) => b.d.points - a.d.points);
  // Відставання після останнього етапу — те саме, що підсумковий відрив: окремим абзацом не повторюємо.
  if (deficits[0] && deficits[0].d.round !== doneRounds.at(-1)) {
    const { id, d } = deficits[0];
    const after = calendar.filter((c) => c.round !== null && c.round > d.round && c.done);
    facts.deficit = {
      driver: drv(id),
      round: d.round,
      place: placeOf.get(d.round) ?? "—",
      points: d.points,
      winsAfter: after.filter((c) => c.winners.some((w) => w.id === id)).length,
      racesAfter: after.length,
      champion: id === ranked[0]?.id,
    };
  }
  // Зараховані не всі результати і суперник набрав більше загалом (1964, 1988).
  if (ranked.length >= 2 && !si.in_progress) {
    const total = (id: string) => points.filter((p) => p.driver === id).reduce((a, p) => a + p.race_points + p.sprint_points, 0);
    const [a, b] = [ranked[0]!, ranked[1]!];
    const [ta, tb] = [total(a.id), total(b.id)];
    if (tb > ta + 0.01)
      facts.dropped = { champion: drv(a.id), championTotal: ta, championCounted: a.points ?? 0, rival: drv(b.id), rivalTotal: tb, rivalCounted: b.points ?? 0 };
  }

  /* --- фото й сусіди --- */
  const c = curatedSeasons[String(year)];
  const own = !!(c && si.driver && c.driverRef === si.driver);
  // Банер на всю ширину — лише з джерела від 960 px (вужчі розтягувались би; замір 13.11: 1966 — 774, 1976 — 687 px);
  // інакше темний банер кольору команди (як на сторінках команд).
  const heroPhoto: SeasonPhoto | null =
    own && c!.hero && c!.credit && c!.hero.width >= HERO_MIN_WIDTH
      ? { ...c!.hero, focus: `50% ${c!.hero.focusY ?? 50}%`, credit: c!.credit, label: String(year) }
      : null;
  const neighbour = (y: number): Neighbour | null => {
    const n = index.find((r) => r.year === y);
    if (!n) return null;
    return {
      year: y,
      champion: n.driver ? driverName(n.driver, n.forename!, n.surname!, locale) : null,
      // «Лідер» — лише поки титул не вирішено (2026 вирішено достроково — «Чемпіон», як на його сторінці).
      inProgress: n.in_progress && !n.driver_decided,
      photo: seasonCardPhoto(y, n.driver),
    };
  };
  const prev = neighbour(year - 1);
  const next = neighbour(year + 1);
  const credits: SeasonPage["credits"] = [];
  const seen = new Set<string>();
  const credit = (p: SeasonPhoto | null, label: string) => {
    if (!p || seen.has(p.credit.page + label)) return;
    seen.add(p.credit.page + label);
    credits.push({ label, href: p.credit.page, author: p.credit.author, license: p.credit.license });
  };
  credit(heroPhoto, `${year}`);
  for (const k of contenders) credit(k.photo, k.driver.name);
  for (const n of [prev, next]) if (n) credit(n.photo, String(n.year));

  return {
    year,
    inProgress: si.in_progress,
    decided: si.driver_decided,
    races: si.races,
    rounds: si.rounds,
    champion,
    championTeams: champTeams,
    cup: si.cup_team ? { team: teamRef(si.cup_team)!, decided: si.cup_decided } : null,
    hero: { photo: heroPhoto, color: c?.color ?? champTeams[0]?.color ?? null },
    keys: { races: si.races, sprints: rounds.filter((r) => r.sprint).length, winners: winnerIds.size, margin, teamWins },
    chart: {
      rounds: doneRounds.map((r) => ({ round: r, place: placeOf.get(r) ?? "—" })),
      lines,
      leaders: doneRounds.map((r) => {
        const id = leaderByRound.get(r);
        return id !== undefined ? (slotOf.get(id) ?? null) : null;
      }),
    },
    facts,
    contenders,
    calendar,
    drivers,
    teams,
    prev,
    next,
    credits,
  };
}
