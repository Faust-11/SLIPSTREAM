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

/** Найгірша позиція пілота після першого кола й коло, на якому він до неї опустився (для тексту про піт-стоп). */
export function lowestAfterStart(pos: (number | null)[]): null | { lap: number; position: number } {
  let best: null | { lap: number; position: number } = null;
  pos.forEach((p, i) => {
    if (i === 0 || p === null) return;
    if (!best || p > best.position) best = { lap: i + 1, position: p };
  });
  return best;
}

/**
 * «Що було б на місце нижче» для вирішальної гонки, коли зараховуються всі результати: чемпіон із фінішем на позицію
 * нижче (очки сусідньої позиції цієї ж гонки) і його суперник — хто тоді вищий у заліку. Повертає суперника, якщо
 * титул дістався б йому (за рівних очок — не робимо висновку: нічию розв'язує рахунок місць).
 */
export function onePlaceLower(
  champion: { final: number; racePoints: number },
  nextPlacePoints: number,
  rivals: { driver: string; final: number }[],
): null | { driver: string; championWould: number; rival: number } {
  const would = champion.final - champion.racePoints + nextPlacePoints;
  const best = [...rivals].sort((a, b) => b.final - a.final)[0];
  if (!best || best.final <= would) return null;
  return { driver: best.driver, championWould: would, rival: best.final };
}
