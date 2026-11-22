import { isLocale } from "@/i18n/config";
import { getPrelimResults } from "@/lib/data/prelim";

// Попередні результати гонки (OpenF1) для головної: клієнтський острів питає, лише коли етап уже завершився за часом (рішення
// 22.11). ISR 5 хв: перший запит після спливу кеша перераховує, решта отримує готовий JSON; мова — частиною шляху, щоб кеш
// лишався статичним. Нема гонки / ще не завершилась / результатів нема — 404 (острів лишає смугу «з'являться після оновлення»).
// /api/ закрито в robots.txt: це дані для клієнта, не сторінки.
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; year: string; round: string }> }) {
  const { lang, year, round } = await params;
  if (!isLocale(lang) || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(round)) return new Response("Not found", { status: 404 });
  const data = await getPrelimResults(Number(year), Number(round), lang);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
