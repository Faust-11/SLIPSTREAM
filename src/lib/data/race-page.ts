// Сторінка гонки /seasons/<рік>/<етап> (фаза 3g): протокол, кваліфікація, сесії, кола, піт-стопи — f1.race_page (0012);
// етап, переможці, поул — f1.season_rounds; залік після етапу — f1.season_points; фото — src/data/curated/circuits.json.
// Обчислення — src/lib/race-math.ts і src/lib/season-math.ts. Лише на сервері.
import "server-only";
import circuitsJson from "@/data/curated/circuits.json";
import type { Locale } from "@/i18n/config";
import { lapLeaders, lapsNotLed, lowestAfterStart, onePlaceLower } from "@/lib/race-math";
import { decidingRound, jolpicaRule, observedMax, seasonRules, type SeasonData } from "@/lib/season-math";
import { dbSelectAll } from "./db";
import { once } from "./once";
import {
  loadNames,
  loadPoints,
  loadRounds,
  loadRules,
  makeDriver,
  PALETTE_SLOTS,
  placeName,
  teamRef,
  type SeasonDriver,
  type SeasonPhoto,
  type SeasonTeamRef,
} from "./season-page";
import { loadSeasonIndex } from "./seasons";
import { gpName } from "./team-page";
import type { Credit, L10n, RacePageRow, RaceQualiJson, RaceResultJson } from "./types";

type CuratedCircuit = L10n & { wiki?: string; hero?: { src: string; srcSet: string; width: number; height: number; focusY?: number }; credit?: Credit };
const circuits = (circuitsJson as unknown as { places: Record<string, CuratedCircuit> }).places;

/** Рядки f1.race_page за ключем «рік/етап» — один запит на збірку. */
const loadRaces = once(async () => {
  const rows = await dbSelectAll<RacePageRow>("race_page", "select=year,round,sessions,race,sprint,quali,sprint_quali,laps,stops&order=year,round");
  return new Map(rows.map((r) => [`${r.year}/${r.round}`, r]));
});

/** Статус результату (0001): 0 фініш, 1 відстав на коло(а), 10 аварія, 11 схід, 20 дискваліфікація, 30 не стартував, 40/41 не кваліфікувався. */
export type ResultStatus = "finished" | "lapped" | "accident" | "retired" | "dsq" | "dns" | "dnq";
export function statusOf(s: number | undefined): ResultStatus {
  switch (s) {
    case 0:
    case undefined:
      return "finished";
    case 1:
      return "lapped";
    case 10:
      return "accident";
    case 20:
      return "dsq";
    case 30:
      return "dns";
    case 40:
    case 41:
      return "dnq";
    default:
      return "retired";
  }
}

export type RaceDriver = SeasonDriver & { team: SeasonTeamRef | null };
export type ResultRow = {
  position: number | null;
  driver: RaceDriver;
  car: number | null;
  grid: number | null;
  laps: number | null;
  /** Час переможця (мс) / відрив від переможця (мс) / відставання в колах; null — не фінішував. */
  time: null | { kind: "total"; ms: number } | { kind: "gap"; ms: number } | { kind: "laps"; n: number };
  status: ResultStatus;
  /** Текст статусу Jolpica англійською (підказка): «Engine», «Collision»… */
  detail: string | null;
  points: number;
  fastestLap: number | null;
  stops: number | null;
  slot: number | null;
};
export type QualiRow = { position: number | null; driver: RaceDriver; q1: number | null; q2: number | null; q3: number | null };
export type SessionItem = {
  kind: "FP1" | "FP2" | "FP3" | "Q" | "SQ" | "SR" | "R";
  at: string | null;
  /** Справжній час (а не північ дати). */
  real: boolean;
  best: null | { driver: SeasonDriver; ms: number | null };
};
export type LapLine = { driver: SeasonDriver; slot: number; positions: (number | null)[]; stops: number[] };
export type RacePage = {
  year: number;
  round: number;
  rounds: number;
  gp: string;
  place: string;
  circuit: string | null;
  firstDate: string | null;
  date: string | null;
  hero: { photo: SeasonPhoto | null; color: string | null };
  /** Вирішальна гонка сезону (титул пілотів став недосяжним для суперників). */
  decider: boolean;
  strip: {
    winners: RaceDriver[];
    poles: SeasonDriver[];
    fastest: null | { driver: SeasonDriver; ms: number };
    champion: SeasonDriver | null;
  };
  sessions: SessionItem[];
  title: null | {
    contenders: { driver: RaceDriver; before: number; after: number; finish: number | null; champion: boolean }[];
    /** «З P4 титул дістався б Ферстаппену: 420 проти 421» — лише коли зараховуються всі результати. */
    lower: null | { position: number; driver: SeasonDriver; would: number; rival: number };
  };
  lapChart: null | {
    laps: number;
    lines: LapLine[];
    winner: SeasonDriver;
    notLed: { from: number; to: number }[];
    ledAll: boolean;
    /** Найбільше падіння в першій п'ятірці (після першого кола) і місце фінішу. */
    drop: null | { driver: SeasonDriver; lap: number; position: number; finish: number; stopLap: number | null };
  };
  race: ResultRow[];
  sprint: ResultRow[];
  quali: QualiRow[];
  sprintQuali: QualiRow[];
  prev: null | { year: number; round: number; place: string };
  next: null | { year: number; round: number; place: string };
  credits: { label: string; href: string; author: string; license: string }[];
};

export async function getRaceKeys(): Promise<{ year: number; round: number }[]> {
  return [...(await loadRaces()).values()].map((r) => ({ year: r.year, round: r.round }));
}

function results(rows: RaceResultJson[], drv: (id: string, team?: string) => RaceDriver, slotOf: Map<string, number>): ResultRow[] {
  const win = rows.find((r) => r.p === 1);
  return rows.map((r) => {
    const status = statusOf(r.s);
    let time: ResultRow["time"] = null;
    if (r.p !== undefined && r.ms !== undefined && win?.ms !== undefined) {
      time = r.p === 1 ? { kind: "total", ms: r.ms } : status === "finished" ? { kind: "gap", ms: r.ms - win.ms } : null;
    }
    if (!time && status === "lapped" && win?.l !== undefined && r.l !== undefined && win.l > r.l) time = { kind: "laps", n: win.l - r.l };
    return {
      position: r.p ?? null,
      driver: drv(r.d, r.t),
      car: r.c ?? null,
      grid: r.g ?? null,
      laps: r.l ?? null,
      time,
      status,
      detail: r.x ?? null,
      points: r.pts ?? 0,
      fastestLap: r.fms ?? null,
      stops: r.ps ?? null,
      slot: slotOf.get(r.d) ?? null,
    };
  });
}

function quali(rows: RaceQualiJson[], drv: (id: string, team?: string) => RaceDriver): QualiRow[] {
  return rows.map((q) => ({ position: q.p ?? null, driver: drv(q.d, q.t), q1: q.q1 ?? null, q2: q.q2 ?? null, q3: q.q3 ?? null }));
}

export async function getRacePage(year: number, round: number, locale: Locale): Promise<RacePage | null> {
  const [races, roundsBy, pointsBy, rules, names, index] = await Promise.all([loadRaces(), loadRounds(), loadPoints(), loadRules(), loadNames(), loadSeasonIndex()]);
  const row = races.get(`${year}/${round}`);
  if (!row) return null;
  const seasonRounds = (roundsBy.get(year) ?? []).filter((r) => r.round !== null && !r.cancelled).sort((a, b) => a.round! - b.round!);
  const meta = seasonRounds.find((r) => r.round === round);
  if (!meta) return null;
  const base = (id: string) => makeDriver(id, names, locale);
  const drv = (id: string, team?: string): RaceDriver => ({ ...base(id), team: teamRef(team) });

  /* --- графік кіл: перша п'ятірка + лідери (як у міграції), кольори — слоти палітри за місцем фінішу --- */
  const finishOrder = row.race.filter((r) => r.p !== undefined).map((r) => r.d);
  const chartIds = Object.keys(row.laps).sort((a, b) => {
    const ia = finishOrder.indexOf(a);
    const ib = finishOrder.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const slotOf = new Map(chartIds.map((id, i) => [id, i % PALETTE_SLOTS]));
  const leaders = lapLeaders(row.laps);
  const winnerRow = row.race.find((r) => r.p === 1);
  let lapChart: RacePage["lapChart"] = null;
  if (chartIds.length > 0 && winnerRow) {
    const lines = chartIds.map((id) => ({
      driver: base(id),
      slot: slotOf.get(id)!,
      positions: row.laps[id]!,
      stops: row.stops.filter((s) => s.d === id && s.lap !== null).map((s) => s.lap!),
    }));
    const notLed = lapsNotLed(leaders, winnerRow.d);
    // Падіння й повернення: найвищий за фінішем із першої п'ятірки, хто після першого кола опускався щонайменше на 4 місця
    // нижче за свій фініш (макет 2025: Норріс — 9-й після піт-стопу на 16-му колі, фініш 3-й; Расселл упав більше, 13 → 5,
    // але для розповіді важливіший подіум).
    let drop: NonNullable<RacePage["lapChart"]>["drop"] = null;
    for (const id of finishOrder.slice(0, 5)) {
      const low = lowestAfterStart(row.laps[id] ?? []);
      const finish = row.race.find((r) => r.d === id)?.p;
      if (!low || finish === undefined || low.position - finish < 4) continue;
      const stopLap = row.stops.filter((s) => s.d === id && s.lap !== null && s.lap <= low.lap).map((s) => s.lap!).at(-1) ?? null;
      drop = { driver: base(id), lap: low.lap, position: low.position, finish, stopLap };
      break;
    }
    lapChart = { laps: leaders.length, lines, winner: base(winnerRow.d), notLed, ledAll: notLed.length === 0, drop };
  }

  /* --- вирішальна гонка (season-math) і «як вирішився титул» --- */
  const si = index.find((s) => s.year === year);
  const points = pointsBy.get(year) ?? [];
  const data: SeasonData = { rounds: seasonRounds.map((r) => r.round!), sprintRounds: new Set(seasonRounds.filter((r) => r.sprint).map((r) => r.round!)), rows: points };
  const rule = rules.get(year);
  const jr = rule ? jolpicaRule(rule.driver_best_results, rule.driver_season_split, seasonRounds.length) : null;
  const obs = observedMax(points);
  const max = si?.in_progress ? { race: Math.max(obs.race, 26), sprint: Math.max(obs.sprint, 8) } : obs;
  const decision = si && (!si.in_progress || si.driver_decided) ? decidingRound(data, seasonRules(data, jr), max) : null;
  const isDecider = decision?.round === round;
  let title: RacePage["title"] = null;
  if (isDecider && decision) {
    const after = points.filter((p) => p.round === round && p.standing_points !== null).sort((a, b) => b.standing_points! - a.standing_points!);
    const prevRound = seasonRounds.filter((r) => r.round! < round).at(-1)?.round;
    const before = new Map(points.filter((p) => p.round === prevRound && p.standing_points !== null).map((p) => [p.driver, p.standing_points!]));
    const top = after.slice(0, 3);
    const contenders = top.map((p) => {
      const rr = row.race.find((r) => r.d === p.driver);
      return { driver: drv(p.driver, rr?.t), before: before.get(p.driver) ?? 0, after: p.standing_points!, finish: rr?.p ?? null, champion: p.driver === decision.driver };
    });
    let lower: NonNullable<RacePage["title"]>["lower"] = null;
    const champRow = row.race.find((r) => r.d === decision.driver);
    // Лише коли зараховуються всі результати (з відкиданням гірших «на місце нижче» не рахується простим відніманням).
    if (jr?.kind === "all" && champRow?.p !== undefined) {
      const nextPts = row.race.find((r) => r.p === champRow.p! + 1)?.pts ?? 0;
      const champ = top.find((t) => t.driver === decision.driver);
      const res = champ
        ? onePlaceLower({ final: champ.standing_points!, racePoints: champRow.pts ?? 0 }, nextPts, top.filter((t) => t.driver !== decision.driver).map((t) => ({ driver: t.driver, final: t.standing_points! })))
        : null;
      if (res) lower = { position: champRow.p + 1, driver: base(res.driver), would: res.championWould, rival: res.rival };
    }
    title = { contenders, lower };
  }

  /* --- сесії --- */
  const qualiRows = quali(row.quali, drv);
  const sprintQualiRows = quali(row.sprint_quali, drv);
  const sessions: SessionItem[] = row.sessions.map((s) => {
    const kind = (["Q1", "QB"].includes(s.k) ? "Q" : s.k === "SQ1" ? "SQ" : s.k) as SessionItem["kind"];
    let best: SessionItem["best"] = null;
    if (kind === "Q" || kind === "SQ") {
      const pole = (kind === "Q" ? qualiRows : sprintQualiRows).find((q) => q.position === 1);
      if (pole) best = { driver: pole.driver, ms: pole.q3 ?? pole.q2 ?? pole.q1 };
    } else if (kind === "R" || kind === "SR") {
      const w = (kind === "R" ? row.race : row.sprint).find((r) => r.p === 1);
      if (w) best = { driver: base(w.d), ms: null };
    } else if (s.best) best = { driver: base(s.best.d), ms: s.best.ms };
    return { kind, at: s.at, real: s.real, best };
  });

  /* --- банер, смуга, сусіди --- */
  const c = meta.circuit ? circuits[meta.circuit] : undefined;
  const heroPhoto: SeasonPhoto | null =
    c?.hero && c.credit ? { ...c.hero, focus: `50% ${c.hero.focusY ?? 62}%`, credit: c.credit, label: placeName(meta.circuit, meta.locality, locale) } : null;
  const fastestRow = row.race.find((r) => r.fl === 1 && r.fms !== undefined);
  const winners = (meta.winners ?? []).map((w) => drv(w.driver, w.team));
  const idx = seasonRounds.findIndex((r) => r.round === round);
  const nb = (r: (typeof seasonRounds)[number] | undefined) => (r && races.has(`${year}/${r.round}`) ? { year, round: r.round!, place: placeName(r.circuit, r.locality, locale) } : null);
  const firstAt = row.sessions.map((s) => s.at).filter((x): x is string => !!x).sort()[0] ?? null;

  return {
    year,
    round,
    rounds: si?.rounds ?? seasonRounds.length,
    gp: gpName(meta.name, locale),
    place: placeName(meta.circuit, meta.locality, locale),
    circuit: meta.circuit,
    firstDate: firstAt ? firstAt.slice(0, 10) : meta.date,
    date: meta.date,
    hero: { photo: heroPhoto, color: winners[0]?.team?.color ?? null },
    decider: isDecider,
    strip: {
      winners,
      poles: (meta.poles ?? []).map((p) => base(p.driver)),
      fastest: fastestRow ? { driver: base(fastestRow.d), ms: fastestRow.fms! } : null,
      champion: isDecider && decision ? base(decision.driver) : null,
    },
    sessions,
    title,
    lapChart,
    race: results(row.race, drv, slotOf),
    sprint: results(row.sprint, drv, slotOf),
    quali: qualiRows,
    sprintQuali: sprintQualiRows,
    prev: nb(seasonRounds[idx - 1]),
    next: nb(seasonRounds[idx + 1]),
    credits: heroPhoto ? [{ label: heroPhoto.label, href: heroPhoto.credit.page, author: heroPhoto.credit.author, license: heroPhoto.credit.license }] : [],
  };
}
