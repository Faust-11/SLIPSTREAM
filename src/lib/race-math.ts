// Обчислення сторінки гонки: формати часу, лідери кіл, відрізки лідерства, «що було б на місце нижче».
// Чисті функції без доступу до бази (дані — f1.race_page, міграція 0012).

/** Час кола: 82207 → «1:22.207»; 9407 → «9.407». */
export function lapTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : String(Number(s).toFixed(3));
}

/** Час гонки: 5167469 → «1:26:07.469». */
export function raceTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Відрив від переможця: 12594 → «+12.594», 61800 → «+1:01.800». */
export function gapTime(ms: number): string {
  return `+${lapTime(ms)}`;
}

/** Лідер після кожного кола (індекс — номер кола − 1): пілот на першій позиції або null. */
export function lapLeaders(laps: Record<string, (number | null)[]>): (string | null)[] {
  const n = Math.max(0, ...Object.values(laps).map((x) => x.length));
  const out: (string | null)[] = Array(n).fill(null);
  for (const [d, pos] of Object.entries(laps)) pos.forEach((p, i) => p === 1 && (out[i] = d));
  return out;
}

/** Відрізки лідерства: [{driver, from, to}] (кола з 1). */
export function lapSpells(leaders: (string | null)[]): { driver: string; from: number; to: number }[] {
  const out: { driver: string; from: number; to: number }[] = [];
  leaders.forEach((d, i) => {
    if (!d) return;
    const last = out.at(-1);
    if (last && last.driver === d && last.to === i) last.to = i + 1;
    else out.push({ driver: d, from: i + 1, to: i + 1 });
  });
  return out;
}

/** Кола, на яких пілот НЕ лідирував, — відрізками (для тексту «лідирував на всіх колах, крім 24–40»). */
export function lapsNotLed(leaders: (string | null)[], driver: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  leaders.forEach((d, i) => {
    if (d === driver) return;
    const last = out.at(-1);
    if (last && last.to === i) last.to = i + 1;
    else out.push({ from: i + 1, to: i + 1 });
  });
  return out;
}

/**
 * Найгірша позиція пілота після першого кола й коло, на якому він до неї опустився — лише якщо вона гірша за позицію
 * після першого кола (рев'ю 13.11: «Паніс на колі 2 опускався до P12» — а він після першого кола вже був 12-м і лише піднімався).
 */
export function lowestAfterStart(pos: (number | null)[]): null | { lap: number; position: number } {
  const first = pos.find((p) => p !== null) ?? null;
  let best: null | { lap: number; position: number } = null;
  for (let i = 1; i < pos.length; i++) {
    const p = pos[i];
    if (p === null || p === undefined) continue;
    if (best === null || p > best.position) best = { lap: i + 1, position: p };
  }
  if (best === null || first === null || best.position <= first) return null;
  return best;
}

/**
 * Очки за місце в сезоні: мода очок кожного місця в гонках сезону без найшвидшого кола (бонус за коло — окремо).
 * `races` — протоколи гонок сезону: [{p, pts, fl}].
 */
export function positionPoints(races: { p?: number; pts?: number; fl?: number }[][]): Map<number, number> {
  const freq = new Map<number, Map<number, number>>();
  for (const race of races)
    for (const r of race) {
      if (r.p === undefined || r.fl === 1) continue;
      const m = freq.get(r.p) ?? new Map<number, number>();
      m.set(r.pts ?? 0, (m.get(r.pts ?? 0) ?? 0) + 1);
      freq.set(r.p, m);
    }
  const out = new Map<number, number>();
  for (const [p, m] of freq) out.set(p, [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]);
  return out;
}

/** Масштаб очок гонки щодо звичайних: 1, половина (0,5) чи подвійні (2, Абу-Дабі 2014) — медіана відношень. */
export function raceScale(race: { p?: number; pts?: number; fl?: number }[], table: Map<number, number>): number {
  const r = race
    .filter((x) => x.p !== undefined && x.fl !== 1 && (table.get(x.p) ?? 0) > 0)
    .map((x) => (x.pts ?? 0) / table.get(x.p!)!)
    .sort((a, b) => a - b);
  return r.length ? r[Math.floor(r.length / 2)]! : 1;
}

/**
 * «Що було б на місце нижче» для вирішальної гонки (зараховуються всі результати): чемпіон і пілот за ним
 * міняються місцями — кожен отримує очки місця іншого, бонус за найшвидше коло лишається тому, хто його показав.
 * Повертає суперника, якщо тоді він вищий за чемпіона (за рівних очок висновку не робимо — нічию розв'язує рахунок місць).
 * Рев'ю 13.11: попередня версія не давала очок пілоту, що піднімається (Абу-Дабі 2021: з P2 Ферстаппен — 388,5,
 * Гамілтон — 394,5, титул змінив би власника).
 */
export function swapWithNext(
  champion: { driver: string; final: number; pts: number; fl: number },
  next: null | { driver: string; final: number; pts: number; fl: number },
  pointsAt: number,
  pointsNext: number,
  others: { driver: string; final: number; standing: number }[],
): null | { driver: string; championWould: number; rival: number } {
  const would = champion.final - champion.pts + pointsNext + champion.fl;
  const field = others.filter((o) => o.driver !== champion.driver && o.driver !== next?.driver);
  if (next) field.push({ driver: next.driver, final: next.final - next.pts + pointsAt + next.fl, standing: others.find((o) => o.driver === next.driver)?.standing ?? 999 });
  // Рівні очки суперників — порядок заліку (рахунок місць; рев'ю 13.11: 2007 — Гамілтон і Алонсо по 109, другий — Гамілтон).
  const best = field.sort((a, b) => b.final - a.final || a.standing - b.standing)[0];
  if (!best || best.final <= would) return null;
  return { driver: best.driver, championWould: would, rival: best.final };
}
