/**
 * Старі адреси історій (7c, задача 8): `src/data/curated/story-redirects.json` — `{ "<стара адреса>": "<нова>" }`. Записує адмінка
 * при зміні адреси історії (один PR: файли, фото, посилання інших історій, цей файл). Читає `next.config.ts` → permanent-редирект
 * на обох мовах. Файл самодостатній (без імпортів проєкту): його читає конфіг Next до збірки.
 */
export type StoryRedirects = Record<string, string>;

const SLUG = /^[a-z0-9][a-z0-9-]{0,55}$/;

/** Лише коректні пари адреса → адреса; усе інше (зіпсований файл) ігноруємо, а не кладемо збірку. */
export function parseRedirects(raw: unknown): StoryRedirects {
  const out: StoryRedirects = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [from, to] of Object.entries(raw as Record<string, unknown>)) {
    if (SLUG.test(from) && typeof to === "string" && SLUG.test(to) && from !== to) out[from] = to;
  }
  return out;
}

/** EN — без префікса, UK — під /uk (src/i18n/routing.ts); /en/stories/… і так редиректиться на без префікса. */
export function storyRedirectRules(map: StoryRedirects): { source: string; destination: string; permanent: true }[] {
  return Object.entries(map).flatMap(([from, to]) => [
    { source: `/stories/${from}`, destination: `/stories/${to}`, permanent: true as const },
    { source: `/uk/stories/${from}`, destination: `/uk/stories/${to}`, permanent: true as const },
  ]);
}
