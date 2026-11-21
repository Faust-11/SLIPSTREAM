/**
 * «Цей день у Формулі-1» на головній: які події показати в картці (до трьох). Чиста логіка без бази — її перевіряють
 * unit-тести. Кожного виду беремо найновіше (гонка, народження, смерть) по колу, доки не наберемо `max`; якщо чогось
 * немає — його місце займають інші події того ж дня (5 гонок і жодних народжень → три гонки).
 */
export type EventKind = "race" | "born" | "died";
export const EVENT_KINDS: readonly EventKind[] = ["race", "born", "died"];

/** `byKind[kind]` — події виду, від найновіших до найстаріших. Повертає вибрані у порядку «гонки, народження, смерті». */
export function pickEvents<T>(byKind: Record<EventKind, readonly T[]>, max = 3): { events: T[]; kinds: EventKind[]; more: number } {
  const taken: Record<EventKind, T[]> = { race: [], born: [], died: [] };
  let count = 0;
  for (let round = 0; count < max; round++) {
    let any = false;
    for (const k of EVENT_KINDS) {
      const item = byKind[k][round];
      if (item === undefined) continue;
      any = true;
      if (count < max) {
        taken[k].push(item);
        count++;
      }
    }
    if (!any) break;
  }
  const events: T[] = [];
  const kinds: EventKind[] = [];
  for (const k of EVENT_KINDS) {
    for (const e of taken[k]) {
      events.push(e);
      kinds.push(k);
    }
  }
  const total = EVENT_KINDS.reduce((s, k) => s + byKind[k].length, 0);
  return { events, kinds, more: total - events.length };
}

/** День, який покажемо: запитаний, якщо в нього є події, інакше найближчий наступний (за колом року) з подіями. */
export function nearestDay(keys: readonly string[], all: readonly string[], key: string): string | null {
  if (keys.length === 0) return null;
  if (keys.includes(key)) return key;
  const i = all.indexOf(key);
  if (i < 0) return null;
  for (let step = 1; step <= all.length; step++) {
    const k = all[(i + step) % all.length]!;
    if (keys.includes(k)) return k;
  }
  return null;
}
