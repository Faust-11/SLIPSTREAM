import { locales } from "@/i18n/config";
import { getHomeDay } from "@/lib/data/home-day";
import { allDayKeys, parseDayKey } from "@/lib/on-this-day";

// Картка «Цей день у Формулі-1» на головній (головна статична й дати не знає): по одному статичному JSON на мову й день
// року (2 × 366, зокрема порожні дні — для них віддаємо найближчий з подіями). Збираються з кожним деплоєм разом із
// даними; поза списком — 404 (dynamicParams = false). /api/ закрито в robots.txt: це дані для клієнта, не сторінки.
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((lang) => allDayKeys().map((day) => ({ lang, day })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; day: string }> }) {
  const { lang, day } = await params;
  const locale = locales.find((l) => l === lang);
  if (!locale || !parseDayKey(day)) return new Response("Not found", { status: 404 });
  const data = await getHomeDay(day, locale);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
