import { getRaceWeather } from "@/lib/data/weather";

// Погода уікенду для сторінки гонки (клієнтський острів; сама сторінка статична). ISR 10 хв: перший запит після спливу
// кешу перераховує, решта отримує готовий JSON. Невідома гонка чи сезон до 2023 — 404; збій джерел — 200 з порожніми
// сесіями (блок не показується), а не 500. /api/ закрито в robots.txt: це дані для клієнта, не сторінки.
export const revalidate = 600;

export async function GET(_req: Request, { params }: { params: Promise<{ year: string; round: string }> }) {
  const { year, round } = await params;
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(round)) return new Response("Not found", { status: 404 });
  const data = await getRaceWeather(Number(year), Number(round));
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
