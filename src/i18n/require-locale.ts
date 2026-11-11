import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";

/**
 * Параметр [lang] як Locale. З `dynamicParams = false` у [lang]/layout невідома мова сюди не доходить
 * (Next віддає статичний 404 — global-not-found); виклик notFound() — лише звуження типу на крайній випадок.
 */
export function requireLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}
