/**
 * Смуга сезонів 1950–2026 одним `linear-gradient` на картку (у макеті — 77 елементів на картку,
 * 164 × 77 = 12 628 вузлів DOM). Кольори — CSS-змінні `--strip-on` / `--strip-off` (тема).
 */
export const STRIP_FROM = 1950;
export const STRIP_TO = 2026;

const pct = (n: number) => `${Number(n.toFixed(3))}%`;

export function seasonStripGradient(
  ranges: readonly (readonly [number, number])[],
  from = STRIP_FROM,
  to = STRIP_TO,
): string {
  const total = to - from + 1;
  const on = new Array<boolean>(total).fill(false);
  for (const [a, b] of ranges) for (let y = Math.max(a, from); y <= Math.min(b, to); y++) on[y - from] = true;

  const stops: string[] = [];
  let start = 0;
  for (let i = 1; i <= total; i++) {
    if (i === total || on[i] !== on[start]) {
      stops.push(`var(--strip-${on[start] ? "on" : "off"}) ${pct((start / total) * 100)} ${pct((i / total) * 100)}`);
      start = i;
    }
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Підпис років під смугою: усі діапазони «1954–1955, 2010–2026» (у макеті понад 3 скорочувались
 *  до «перший, … останній» — губились роки, які смуга показує; дизайн-рев'ю 11.11). */
export function seasonsText(ranges: readonly (readonly [number, number])[]): string {
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}
