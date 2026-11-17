import "server-only";

/**
 * Хайлайт гонки з офіційного YouTube-каналу FORMULA 1 (рішення користувача 17.11): поле «посилання» в адмінці.
 * Перевірка — oEmbed YouTube (без ключа; замір 17.11): автор = канал FORMULA 1 (author_url …/@Formula1), відео публічне
 * й дозволене до вбудовування (інакше oEmbed — 401/400/404). Формат запису — як у scripts/curated/race_videos.py.
 */
export const OFFICIAL_CHANNEL = "https://www.youtube.com/@Formula1";
export const VIDEOS_PATH = "src/data/curated/race-videos.json";

export type RaceVideo = { id: string; title: string; hd?: boolean };

/** Будь-яке звичне посилання (watch?v=, youtu.be, shorts, embed, live) або сам id → id з 11 знаків; інакше null. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export type VideoCheck = { ok: true; video: RaceVideo } | { ok: false; reason: string };

export async function checkOfficial(id: string, fetchImpl: typeof fetch = fetch): Promise<VideoCheck> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: "no-store" });
  } catch {
    return { ok: false, reason: "YouTube не відповідає — спробуйте пізніше" };
  }
  if (!res.ok) return { ok: false, reason: "відео не знайдено, приватне або його заборонено вбудовувати" };
  const meta = (await res.json().catch(() => ({}))) as { title?: unknown; author_url?: unknown };
  if (meta.author_url !== OFFICIAL_CHANNEL) return { ok: false, reason: "це не офіційний канал FORMULA 1" };
  if (typeof meta.title !== "string" || !meta.title.trim()) return { ok: false, reason: "у відео немає назви" };
  // hd — є превʼю 1280 px (maxresdefault), як у race_videos.py.
  const hd = await fetchImpl(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, { method: "HEAD", cache: "no-store" })
    .then((r) => r.ok)
    .catch(() => false);
  return { ok: true, video: { id, title: meta.title.trim(), ...(hd ? { hd: true } : {}) } };
}

/** Новий текст race-videos.json: ключ «рік/етап», порядок — числовий (як у файлі); null — прибрати відео гонки. */
export function applyVideo(current: string, key: string, video: RaceVideo | null): string {
  if (!/^\d{4}\/\d{1,2}$/.test(key)) throw new Error("гонка");
  const data = JSON.parse(current) as { _about: string; videos: Record<string, RaceVideo> };
  if (video) data.videos[key] = video;
  else delete data.videos[key];
  data.videos = Object.fromEntries(Object.entries(data.videos).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  return `${JSON.stringify(data, null, 1)}\n`;
}
