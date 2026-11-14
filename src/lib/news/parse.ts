// Розбір джерел новин (фаза 4a, docs/plans/2026-11-14-phase4a-news.md): RSS видань, пости Bluesky, склейка дублів,
// фільтр F1-слів, безпечні посилання й картинки. Чисті функції без мережі — тести на знімку e2e/fixtures/news.

export type SourceKey = "f1" | "motorsport" | "autosport";

export type RssItem = { title: string; link: string; summary: string; publishedAt: string | null; image: string | null };

export type Headline = {
  id: string;
  source: SourceKey;
  title: string;
  summary: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
  /** Той самий матеріал в іншому виданні (Motorsport.com і Autosport — одна редакція). */
  also: { source: SourceKey; url: string }[];
};

export type Post = { id: string; handle: string; name: string; text: string; url: string; createdAt: string };

/** Домени посилань кожного видання: інші посилання зі стрічки відкидаємо (лише https). */
export const LINK_HOSTS: Record<SourceKey, string[]> = {
  f1: ["www.formula1.com"],
  motorsport: ["www.motorsport.com"],
  autosport: ["www.autosport.com"],
};
/** Домени прев'ю — ті самі, що в CSP img-src (next.config.ts). */
export const IMAGE_HOSTS = ["media.formula1.com", /^cdn-\d+\.motorsport\.com$/] as const;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»", euro: "€", pound: "£",
};

/** Сутності HTML (іменовані з NAMED і числові) → символи; невідомі лишаються як є. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;

/** Обрізання за кодовими точками (емодзі не розрізаються навпіл) з «…». */
export function clip(t: string, max: number): string {
  const cps = Array.from(t);
  return cps.length > max ? `${cps.slice(0, max - 1).join("").trimEnd()}…` : t;
}

/** Простий текст: CDATA розгорнуто, теги прибрано, сутності розкодовано, пробіли стиснуто. */
export function plainText(raw: string | null | undefined, max = Infinity): string {
  if (!raw) return "";
  let t = decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(TAG, " "));
  // Закодовані теги в анонсі (&lt;p&gt;) — другий прохід лише коли після розкодування справді є теги: інакше
  // «P1 &lt; P2 but &gt; expectations» втрачав текст між знаками (рев'ю PR #20).
  if (TAG.test(t)) t = decodeEntities(t.replace(TAG, " "));
  TAG.lastIndex = 0;
  t = t.replace(/\s+/g, " ").trim();
  return max === Infinity ? t : clip(t, max);
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1]!.trim() : null;
}
function attr(block: string, name: string, a: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}=(["'])([^"']+)\\1`, "i"));
  return m ? decodeEntities(m[2]!) : null;
}

/** https-адреса з дозволеного домену, інакше null. */
export function safeUrl(raw: string | null | undefined, hosts: readonly (string | RegExp)[]): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  // Нестандартний порт: CSP img-src (*.motorsport.com) його не пропустить — картинка зламалась би (рев'ю PR #20).
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!hosts.some((h) => (typeof h === "string" ? u.hostname === h : h.test(u.hostname)))) return null;
  // Мітки трекінгу (utm_*) не потрібні для відкриття статті, а подовжують кожен запис ×2 у HTML і даних RSC.
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return u.href;
}

/** Прев'ю: лише дозволені домени; Cloudinary formula1.com — ширина 480 замість 2048 (картка ≤ 168 px, ×2 — щільність). */
export function previewUrl(raw: string | null | undefined): string | null {
  const u = safeUrl(raw, IMAGE_HOSTS);
  if (!u) return null;
  return u.startsWith("https://media.formula1.com/") ? u.replace(/\/c_lfill,w_\d+\//, "/c_lfill,w_480/") : u;
}

function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(plainText(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Записи RSS 2.0 (title, link, description, pubDate, enclosure/media) — до max штук. */
export function parseRss(xml: string, source: SourceKey, max = 50): RssItem[] {
  const out: RssItem[] = [];
  const seen = new Set<string>();
  for (const block of xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []) {
    const title = plainText(tag(block, "title"), 200);
    const link = safeUrl(plainText(tag(block, "link")), LINK_HOSTS[source]);
    // Те саме посилання двічі в стрічці — один запис (інакше однакові ключі списку).
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      summary: plainText(tag(block, "description"), 220),
      publishedAt: isoDate(tag(block, "pubDate")),
      image: previewUrl(attr(block, "enclosure", "url") ?? attr(block, "media:content", "url") ?? attr(block, "media:thumbnail", "url")),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Метадані статті formula1.com: og:image і datePublished (JSON-LD) — у стрічці їх немає (замір 14.11). */
export function parseF1Article(html: string): { image: string | null; date: string | null } {
  const meta = html.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i)?.[0] ?? "";
  const img = meta.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? null;
  const date = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  // Типова картинка «поділитися» — не прев'ю статті.
  const image = img && !img.includes("/social/f1-default-share") ? previewUrl(decodeEntities(img)) : null;
  return { image, date: isoDate(date) };
}

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "after", "as", "at", "with", "is", "f1", "his", "her"]);
function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}
export function jaccard(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/**
 * Поріг склейки 0,7 і дати в межах 48 год. При 0,5 склеювались різні новини з шаблонними заголовками («Verstappen wins
 * Brazil GP» / «… Las Vegas GP» = 0,50, рев'ю PR #20); на знімку 14.11 справжні дублі — 1,00 і 0,91, у 0,25–0,9 пар немає.
 */
export const MERGE_THRESHOLD = 0.7;
const MERGE_WINDOW_MS = 48 * 3600_000;
const near = (a: string | null, b: string | null) => a === null || b === null || Math.abs(Date.parse(a) - Date.parse(b)) <= MERGE_WINDOW_MS;

/**
 * Стрічка заголовків: новіші вгорі (без дати — наприкінці); матеріал, що вже є в іншому виданні (Жаккар ≥ поріг), стає
 * «Також: …» у ранішого запису. Склеюються лише різні видання.
 */
export function mergeHeadlines(items: { source: SourceKey; item: RssItem }[]): Headline[] {
  const sorted = [...items].sort((a, b) => (b.item.publishedAt ?? "").localeCompare(a.item.publishedAt ?? ""));
  const out: Headline[] = [];
  for (const { source, item } of sorted) {
    const twin = out.find(
      (h) =>
        h.source !== source &&
        !h.also.some((x) => x.source === source) &&
        near(h.publishedAt, item.publishedAt) &&
        jaccard(h.title, item.title) >= MERGE_THRESHOLD,
    );
    if (twin) {
      twin.also.push({ source, url: item.link });
      twin.image ??= item.image;
      continue;
    }
    out.push({ id: item.link, source, title: item.title, summary: item.summary, url: item.link, image: item.image, publishedAt: item.publishedAt, also: [] });
  }
  return out;
}

// Фільтр F1 (заміри на знімку 14.11, 278 власних постів 11 акаунтів): сильне слово — досить одного; слабке (траси,
// загальні гоночні слова, неоднозначні імена й назви) — потрібно два різних. Одне «championship» чи «Madrid» пропускало
// MotoGP, ралі й особисте. Усі слова — цілими (\b): «audi» ловив audio, «stella» — constellation (рев'ю PR #20).
const wordsRe = (list: string[], flags: string) => new RegExp(String.raw`\b(?:${list.join("|")})\b`, flags);
const STRONG = wordsRe(
  [
    "f1", String.raw`formula\s?(?:1|one)`, "grand prix", "gp", "fia", "paddock", "drs", "pirelli", "team principal", "power unit", "lights out",
    "ferrari", "mclaren", "red bull", "racing bulls", "aston martin", "haas", "sauber", "cadillac", "f1 academy",
    "antonelli", "leclerc", "norris", "piastri", "verstappen", "hadjar", "tsunoda", "lindblad", "alonso", "gasly", "colapinto",
    "albon", "ocon", "bearman", "h[uü]lkenberg", "bortoleto", "bottas", "tsolov", "toto wolff", "horner", "mekies", "vasseur",
    "komatsu", "vowles", "briatore", "domenicali", "ben sulayem",
  ],
  "i",
);
const WEAK = wordsRe(
  [
    // Неоднозначні: місто Гамільтон, «a stroll», «alpine skiing», сестри Вільямс, ралі-Сайнс…
    "mercedes", "alpine", "williams", "audi", "russell", "hamilton", "lawson", "stroll", "sainz", "p[eé]rez", "camara", "stella", "honda",
    "qualifying", "quali", "pole", "podium", String.raw`pit ?stops?`, String.raw`pit ?lane`, "safety car", "vsc", "grid", String.raw`stewards?`,
    String.raw`penalt\w*`, "chequered", String.raw`laps?`, "sprint", String.raw`constructors?`, "championship", "title", String.raw`tyres?`,
    "testing", String.raw`drivers?`, "max",
    "las vegas", "qatar", "abu dhabi", "interlagos", String.raw`s[aã]o paulo`, "monza", "silverstone", "suzuka", "monaco", "imola", "spa",
    "zandvoort", "baku", "singapore", "melbourne", "bahrain", "jeddah", "miami", "montreal", "barcelona", "madrid", "hungaroring",
    "austin", "cota", "mexico",
  ],
  "gi",
);
export function isF1Text(text: string): boolean {
  if (STRONG.test(text)) return true;
  return new Set([...text.matchAll(WEAK)].map((m) => m[0].toLowerCase())).size >= 2;
}

type BskyFeed = {
  feed?: {
    post: {
      uri?: string;
      author?: { handle?: string; displayName?: string; labels?: { val?: string }[] };
      record?: { text?: string; createdAt?: string; reply?: unknown };
      indexedAt?: string;
    };
    reason?: unknown;
  }[];
};

const HANDLE = /^[a-z0-9][a-z0-9.-]{0,252}[a-z0-9]$/i;
const RKEY = /^[a-z0-9._~:-]{1,512}$/i;

/**
 * Власні пости акаунта про F1: без репостів (reason) і відповідей, без авторів з міткою `!no-unauthenticated` (просили
 * не показувати без входу). Посилання — bsky.app з перевіреними handle і rkey.
 */
export function bskyPosts(feed: BskyFeed): { posts: Post[]; own: number } {
  const posts: Post[] = [];
  let own = 0;
  for (const item of feed.feed ?? []) {
    const p = item.post;
    if (item.reason || p.record?.reply) continue;
    const handle = p.author?.handle ?? "";
    const rkey = p.uri?.split("/").at(-1) ?? "";
    // createdAt задає клієнт (може бути в майбутньому й закріпити пост угорі) — беремо раніший з createdAt і indexedAt.
    const times = [isoDate(p.record?.createdAt), isoDate(p.indexedAt)].filter((x): x is string => x !== null).sort();
    const created = times[0] ?? null;
    if (!HANDLE.test(handle) || !RKEY.test(rkey) || !created) continue;
    if (p.author?.labels?.some((l) => l.val === "!no-unauthenticated")) continue;
    own++;
    const text = (p.record?.text ?? "").trim();
    if (!text || !isF1Text(text)) continue;
    posts.push({
      id: p.uri!,
      handle,
      name: (p.author?.displayName ?? "").trim() || handle,
      text: clip(text, 600),
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      createdAt: created,
    });
  }
  return { posts, own };
}
