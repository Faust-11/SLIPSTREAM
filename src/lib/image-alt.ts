import { fill } from "@/i18n/fill";

/**
 * Альтернативний текст великих фото (SEO — пошук за картинками, і читачі екрана), мовою сторінки.
 * Маленькі аватари поруч з ім'ям і обкладинки новин лишаються з alt="" — текст поруч уже є (рішення 15.11).
 */

/** Фото чемпіона (або лідера сезону, що триває, поки титул не вирішено): картка сезону, банер сторінки сезону. */
export function seasonPhotoAlt(t: { champion: string; leader: string }, name: string, year: number, champion: boolean): string {
  return fill(champion ? t.champion : t.leader, { name, year });
}

/** Банер траси (сторінка траси й гонки): фото зроблено на трасі, не завжди — сама траса (Монца — старт 1975). */
export function circuitPhotoAlt(t: { full: string; short: string }, short: string, place: string): string {
  return short === place ? fill(t.short, { short }) : fill(t.full, { short, place });
}
