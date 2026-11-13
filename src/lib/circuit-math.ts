// Чисті обчислення сторінок трас (фаза 3h, docs/plans/2026-11-13-phase3h-circuits.md). Без server-only: потрібні й тестам.

/** Відсортовані роки → суцільні проміжки: [1950, 1951, 1953] → [[1950, 1951], [1953, 1953]]. */
export function yearSpans(years: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const y of [...new Set(years)].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && y === last[1] + 1) last[1] = y;
    else out.push([y, y]);
  }
  return out;
}

/**
 * Підпис проміжків для картки: до трьох — усі («1950–1979, 1981–2026»), більше — перший і останній через «…»
 * (Сільверстоун у 1955–1986 чергувався з Ейнтрі й Брендс-Гетчем: «1950–1954 … 1987–2026», як у макеті).
 */
export function spansLabel(spans: [number, number][]): string {
  const one = ([a, b]: [number, number]) => (a === b ? String(a) : `${a}–${b}`);
  if (spans.length <= 3) return spans.map(one).join(", ");
  return `${one(spans[0]!)} … ${one(spans.at(-1)!)}`;
}

/** Лідери лічильника з нічиїми: { ids — усі з найбільшим значенням (у порядку першої появи), n }; порожній — null. */
export function leaders(counts: Map<string, number>): null | { ids: string[]; n: number } {
  let n = 0;
  for (const v of counts.values()) n = Math.max(n, v);
  if (n === 0) return null;
  return { ids: [...counts].filter(([, v]) => v === n).map(([k]) => k), n };
}

/** Рейтинг лічильника: за спаданням, рівні — у порядку першої появи; перші `top` (з усіма рівними на межі — ні, рівно top). */
export function ranking(counts: Map<string, number>, top: number): { id: string; n: number }[] {
  return [...counts]
    .map(([id, n], i) => ({ id, n, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, top)
    .map(({ id, n }) => ({ id, n }));
}

/** Найчастіше значення (рівні — більше); порожньо — null. Кількість кіл гонки: скорочені гонки (дощ) — рідші. */
export function modeOf(xs: number[]): number | null {
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best: number | null = null;
  let bn = 0;
  for (const [x, n] of c) if (n > bn || (n === bn && best !== null && x > best)) [best, bn] = [x, n];
  return best;
}

/** Рік у проміжках конфігурації ([рік, рік | null — дотепер]). */
export function inSpans(year: number, spans: [number, number | null][]): boolean {
  return spans.some(([a, b]) => a <= year && year <= (b ?? 9999));
}

/** Слаг траси з ref Jolpica: «yas_marina» → «yas-marina» (як у пілотів). */
export function circuitSlug(ref: string): string {
  return ref.toLowerCase().replace(/_/g, "-");
}

export function circuitPath(ref: string): string {
  return `/circuits/${circuitSlug(ref)}`;
}
