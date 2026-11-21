import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { Condition, WeatherData } from "@/lib/weather";

/** Підписи, спільні для таблиці сторінки гонки й компактних блоків (календар, головна). */
export type PrecipLabels = { dry: string; rain: string; mm: string; cond: Record<Condition, string> };

export const DASH = "—";

/** «24–25 °C»; однакові межі — одне значення. */
export function span(r: [number, number], unit: string): string {
  const a = Math.round(r[0]);
  const b = Math.round(r[1]);
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`;
}

const mm = (v: number, labels: PrecipLabels, locale: Locale) => fill(labels.mm, { n: locale === "uk" ? v.toFixed(1).replace(".", ",") : v.toFixed(1) });

/** Опади: для замірів — «Сухо» / «Дощ · N% часу»; для прогнозу — стан неба й кількість опадів за годину. */
export function precipText(d: WeatherData, labels: PrecipLabels, locale: Locale): string {
  if (d.rainShare !== null) return d.rainShare === 0 ? labels.dry : fill(labels.rain, { n: Math.max(1, Math.round(d.rainShare * 100)) });
  const cond = d.condition ? labels.cond[d.condition] : null;
  const amount = d.mm !== null && d.mm >= 0.1 ? mm(d.mm, labels, locale) : null;
  return cond && amount ? `${cond} · ${amount}` : (cond ?? amount ?? DASH);
}
