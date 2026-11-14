import { getNews } from "@/lib/data/news";

// Свіжі новини для блока головної (рішення користувача 14.11): головна статична й бази під час ISR не читає, а новини
// клієнт бере тут — ISR 30 хв, як /news; лише RSS / Bluesky, без бази. Мовно-незалежно (заголовки — мовою видань).
export const revalidate = 1800;

/** Записів у кожній вкладці блока «Новини» головної. */
const TAKE = 10;

export type HomeNewsPayload = {
  headlines: { id: string; source: string; title: string; url: string; publishedAt: string | null }[];
  posts: { id: string; name: string; handle: string; text: string; url: string; createdAt: string }[];
};

export async function GET() {
  const news = await getNews();
  const body: HomeNewsPayload = {
    headlines: news.headlines.slice(0, TAKE).map((h) => ({ id: h.id, source: h.source, title: h.title, url: h.url, publishedAt: h.publishedAt })),
    posts: news.posts.slice(0, TAKE).map((p) => ({ id: p.id, name: p.name, handle: p.handle, text: p.text, url: p.url, createdAt: p.createdAt })),
  };
  return Response.json(body);
}
