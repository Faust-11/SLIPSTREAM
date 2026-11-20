/**
 * Київський час (Europe/Kyiv) без Intl: UTC+2 узимку, UTC+3 влітку (правило ЄС: з 01:00 UTC в останню неділю березня
 * до 01:00 UTC в останню неділю жовтня). Той самий підхід, що в fmt.ts, — готові складники для fmtSession/fmtDay з
 * `utc = true` над зсунутою датою. Збіг з Intl перевіряє src/lib/__tests__/kyiv-time.test.ts.
 */

/** Число останньої неділі місяця (month — 0..11) в UTC. */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

/** Зсув Києва від UTC в годинах для моменту `at`: 2 або 3. */
export function kyivOffsetHours(at: Date): 2 | 3 {
  const y = at.getUTCFullYear();
  const dstStart = Date.UTC(y, 2, lastSunday(y, 2), 1);
  const dstEnd = Date.UTC(y, 9, lastSunday(y, 9), 1);
  const t = at.getTime();
  return t >= dstStart && t < dstEnd ? 3 : 2;
}

/** Дата, зсунута так, що її UTC-складники — київські: для fmtSession(shifted.toISOString(), locale, true). */
export function toKyiv(iso: string): Date {
  const at = new Date(iso);
  return new Date(at.getTime() + kyivOffsetHours(at) * 3_600_000);
}

/** ISO-рядок із київським зсувом («2026-11-20T02:30:00+02:00») — для JSON-LD startDate. */
export function kyivIso(iso: string): string {
  const at = new Date(iso);
  const off = kyivOffsetHours(at);
  return `${toKyiv(iso).toISOString().slice(0, 19)}+0${off}:00`;
}

/** «UTC+2» / «UTC+3» для моменту iso. */
export function kyivOffsetLabel(iso: string): string {
  return `UTC+${kyivOffsetHours(new Date(iso))}`;
}
