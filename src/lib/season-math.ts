// Обчислення сторінки сезону: правило заліку, вирішальний етап, гонки з половиною очок, лідери після етапів.
// Чисті функції без доступу до бази — дані з f1.season_points / season_rounds / season_rules (міграція 0011).
// Заміри й обґрунтування — docs/decisions.md («Фаза 3f», «Вирішальна гонка — заміри»).

export type SeasonPointsRow = {
  round: number;
  driver: string;
  race_points: number;
  sprint_points: number;
  /** Місце в гонці (класифікований), інакше null. */
  place: number | null;
  /** Місце й очки в заліку після етапу (остання сесія етапу). */
  standing: number | null;
  standing_points: number | null;
};

/** Правило заліку: усі результати; кращі n; сезон ділиться після етапу `half` — кращі first і second у половинах. */
export type Rule = { kind: "all" } | { kind: "best"; n: number } | { kind: "split"; half: number; first: number; second: number };

const EPS = 0.01;

/** Правило Jolpica (driver_best_results, driver_season_split) для сезону з `n` етапів. null — правило невідоме. */
export function jolpicaRule(best: number | null, split: number | null, n: number): Rule | null {
  if (best === null || split === null) return null;
  if (best === -1) return { kind: "all" };
  if (split === 0) return best > 0 ? { kind: "best", n: best } : null;
  const half = Math.floor(n / 2); // замір 13.11: «вниз» відтворює заліки, «вгору» — ні (1979)
  if (best === -2) return { kind: "split", half, first: half - 1, second: n - half - 1 };
  return best > 0 ? { kind: "split", half, first: best, second: best } : null;
}

const sumBest = (xs: number[], k: number) =>
  [...xs].sort((a, b) => b - a).slice(0, Math.max(k, 0)).reduce((a, b) => a + b, 0);

/** Зараховані очки: `values[i]` — очки i-го етапу сезону (за порядком). */
export function counted(values: number[], rule: Rule): number {
  if (rule.kind === "all") return values.reduce((a, b) => a + b, 0);
  if (rule.kind === "best") return sumBest(values, rule.n);
  return sumBest(values.slice(0, rule.half), rule.first) + sumBest(values.slice(rule.half), rule.second);
}

/** Усі можливі правила для сезону з n етапів (для виведення правила з даних). */
export function* ruleCandidates(n: number): Generator<Rule> {
  yield { kind: "all" };
  for (let k = 1; k < n; k++) yield { kind: "best", n: k };
  for (let half = 1; half < n; half++)
    for (let first = 1; first <= half; first++)
      for (let second = 1; second <= n - half; second++)
        if (first < half || second < n - half) yield { kind: "split", half, first, second };
}

export type SeasonData = {
  /** Номери етапів сезону за порядком (без скасованих), зокрема майбутні в поточному сезоні. */
  rounds: number[];
  /** Етапи зі спринтом. */
  sprintRounds: ReadonlySet<number>;
  rows: SeasonPointsRow[];
};

type Prepared = {
  done: number[];
  drivers: string[];
  raw: Map<string, number[]>; // за індексом етапу в `rounds`
  places: Map<string, (number | null)[]>;
  standing: Map<number, Map<string, { pos: number | null; pts: number }>>;
};

function prepare(s: SeasonData): Prepared {
  const idx = new Map(s.rounds.map((r, i) => [r, i]));
  const raw = new Map<string, number[]>();
  const places = new Map<string, (number | null)[]>();
  const standing = new Map<number, Map<string, { pos: number | null; pts: number }>>();
  const done = new Set<number>();
  for (const r of s.rows) {
    const i = idx.get(r.round);
    if (i === undefined) continue;
    if (!raw.has(r.driver)) {
      raw.set(r.driver, Array(s.rounds.length).fill(0));
      places.set(r.driver, Array(s.rounds.length).fill(null));
    }
    const pts = raw.get(r.driver)!;
    pts[i] = (pts[i] ?? 0) + r.race_points + r.sprint_points;
    places.get(r.driver)![i] = r.place;
    if (r.standing_points !== null) {
      done.add(r.round);
      if (!standing.has(r.round)) standing.set(r.round, new Map());
      standing.get(r.round)!.set(r.driver, { pos: r.standing, pts: r.standing_points });
    }
  }
  return { done: s.rounds.filter((r) => done.has(r)), drivers: [...raw.keys()], raw, places, standing };
}

/** Правило відтворює підсумкові очки всіх пілотів (останній етап із заліком). */
export function reproduces(s: SeasonData, rule: Rule, p: Prepared = prepare(s)): boolean {
  const last = p.done.at(-1);
  if (last === undefined) return false;
  const n = s.rounds.indexOf(last) + 1;
  const fin = p.standing.get(last)!;
  return p.drivers.every((d) => Math.abs(counted(p.raw.get(d)!.slice(0, n), rule) - (fin.get(d)?.pts ?? 0)) < EPS);
}

/**
 * Правила, за якими рахувати сезон: правило Jolpica, якщо воно відтворює залік; інакше — усі правила, що відтворюють
 * (виведені з даних); порожньо — жодне не відтворює (1955, 1956: спільні машини).
 */
export function seasonRules(s: SeasonData, jolpica: Rule | null): Rule[] {
  const p = prepare(s);
  if (jolpica && reproduces(s, jolpica, p)) return [jolpica];
  const out: Rule[] = [];
  const last = p.done.at(-1);
  if (last === undefined) return out;
  for (const r of ruleCandidates(s.rounds.indexOf(last) + 1)) if (reproduces(s, r, p)) out.push(r);
  return out;
}

/** Рахунок місць для нічиєї за очками: кількість 1-х, 2-х… місць (+ extraWins перемог). */
function placeCounts(places: (number | null)[], upto: number, extraWins = 0): number[] {
  const c = Array(40).fill(0);
  for (let i = 0; i < upto; i++) {
    const v = places[i];
    if (v !== null && v !== undefined && v >= 1 && v <= 40) c[v - 1]++;
  }
  c[0] += extraWins;
  return c;
}
/** a > b лексикографічно. */
const greater = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > EPS) return a[i]! > b[i]!;
  return false;
};

export type MaxPerRound = { race: number; sprint: number };

/** Найбільше очок гонки й спринту, які отримав один пілот на етапі сезону (оцінка «найкращого випадку» суперника). */
export function observedMax(rows: SeasonPointsRow[]): MaxPerRound {
  let race = 0;
  let sprint = 0;
  for (const r of rows) {
    race = Math.max(race, r.race_points);
    sprint = Math.max(sprint, r.sprint_points);
  }
  return { race, sprint };
}

/**
 * Перший етап, після якого лідера заліку неможливо наздогнати за правилом `rule`: найкращий випадок кожного суперника
 * (перемоги в усіх етапах, що лишились, з `max` очок) не дає ні більше очок, ні рівних очок із кращим рахунком місць.
 */
export function decidedAfter(s: SeasonData, rule: Rule, max: MaxPerRound, p: Prepared = prepare(s)): null | { round: number; driver: string } {
  const n = s.rounds.length;
  for (const round of p.done) {
    const k = s.rounds.indexOf(round);
    const st = p.standing.get(round)!;
    // Лідер — за очками (див. leadersByRound): виключений пілот (1997) у сезоні лишався суперником.
    const leader = [...st].sort((a, b) => b[1].pts - a[1].pts || (a[1].pos ?? 999) - (b[1].pos ?? 999))[0]?.[0];
    if (!leader) continue;
    const lead = [st.get(leader)!.pts, ...placeCounts(p.places.get(leader) ?? [], k + 1)];
    const rest = s.rounds.slice(k + 1);
    const caught = p.drivers.some((d) => {
      if (d === leader) return false;
      const vals = p.raw.get(d)!.slice(0, k + 1);
      for (const r of rest) vals.push(max.race + (s.sprintRounds.has(r) ? max.sprint : 0));
      while (vals.length < n) vals.push(0);
      const best = [counted(vals, rule), ...placeCounts(p.places.get(d)!, k + 1, rest.length)];
      return !greater(lead, best);
    });
    if (!caught) return { round, driver: leader };
  }
  return null;
}

/** Вирішальний етап, лише якщо всі правила, що відтворюють залік, дають той самий етап; інакше — null (висновку не робимо). */
export function decidingRound(s: SeasonData, rules: Rule[], max: MaxPerRound): null | { round: number; driver: string } {
  if (rules.length === 0) return null;
  const p = prepare(s);
  let first: null | { round: number; driver: string } = null;
  for (let i = 0; i < rules.length; i++) {
    const d = decidedAfter(s, rules[i]!, max, p);
    if (!d) return null;
    if (i === 0) first = d;
    else if (d.round !== first!.round || d.driver !== first!.driver) return null;
  }
  return first;
}

/**
 * Лідер заліку після кожного етапу: найбільше очок, нічию розв'язує офіційне місце. Не «місце 1»: Jolpica знімає місця
 * виключеного пілота з УСІХ етапів (Шумахер 1997 — без місця з 1-го етапу, хоча перед Хересом мав 78 проти 77), а графік
 * показує сезон, яким він був; підсумкова таблиця — офіційна.
 */
export function leadersByRound(rows: SeasonPointsRow[]): { round: number; driver: string }[] {
  const best = new Map<number, SeasonPointsRow>();
  for (const r of rows) {
    if (r.standing_points === null) continue;
    const b = best.get(r.round);
    const better =
      !b ||
      r.standing_points > b.standing_points! + EPS ||
      (Math.abs(r.standing_points - b.standing_points!) <= EPS && (r.standing ?? 999) < (b.standing ?? 999));
    if (better) best.set(r.round, r);
  }
  return [...best].sort((a, b) => a[0] - b[0]).map(([round, r]) => ({ round, driver: r.driver }));
}

/** Відрізки лідерства: «Норріс 1–4, Піастрі 5–19, Норріс 20–24». */
export function leadSpells(leaders: { round: number; driver: string }[]): { driver: string; from: number; to: number }[] {
  const out: { driver: string; from: number; to: number }[] = [];
  for (const l of leaders) {
    const last = out.at(-1);
    if (last && last.driver === l.driver) last.to = l.round;
    else out.push({ driver: l.driver, from: l.round, to: l.round });
  }
  return out;
}

/** Найбільше відставання пілота від лідера заліку після етапу (і після якого етапу), якщо пілот не лідирував. */
export function maxDeficit(rows: SeasonPointsRow[], driver: string): null | { round: number; points: number } {
  const byRound = new Map<number, { leader: number; mine: number }>();
  for (const r of rows) {
    if (r.standing_points === null) continue;
    const v = byRound.get(r.round) ?? { leader: 0, mine: 0 };
    v.leader = Math.max(v.leader, r.standing_points);
    if (r.driver === driver) v.mine = r.standing_points;
    byRound.set(r.round, v);
  }
  let best: null | { round: number; points: number } = null;
  for (const [round, v] of [...byRound].sort((a, b) => a[0] - b[0])) {
    const gap = v.leader - v.mine;
    if (gap > EPS && (!best || gap > best.points + EPS)) best = { round, points: gap };
  }
  return best;
}

export type RoundWinner = { round: number | null; cancelled: boolean; winners: { driver: string }[] | null; winner_points: number | null };

/**
 * Гонки з половиною очок: очки єдиного переможця < 0,75 типових очок переможця сезону (мода; спільні машини 1950-х
 * пропускаємо — там очки поділено). Замір 13.11 на дампі: рівно 6 гонок 1950–2025, хибних немає.
 */
export function halfPointRounds(rounds: RoundWinner[]): Set<number> {
  const single = rounds.filter((r) => r.round !== null && !r.cancelled && r.winners?.length === 1 && r.winner_points !== null);
  const freq = new Map<number, number>();
  for (const r of single) freq.set(r.winner_points!, (freq.get(r.winner_points!) ?? 0) + 1);
  let mode = 0;
  let top = 0;
  for (const [v, c] of freq) if (c > top || (c === top && v > mode)) [mode, top] = [v, c];
  return new Set(single.filter((r) => r.winner_points! < 0.75 * mode).map((r) => r.round!));
}
