import "server-only";
import { classifyLicense, type LicenseVerdict } from "./license";

/**
 * Wikimedia Commons для адмінки (сервер): пошук фото і один файл з автором, ліцензією й мініатюрою. API без ключа;
 * Wikimedia просить змістовний User-Agent (без особистих даних). Мініатюри — лише стандартних ширин (960/1280:
 * нестандартні дають HTTP 429 — заміри scripts/curated/hero_photos.py), і лише з доменів Wikimedia: мініатюри з
 * thumb.wikimedia.org, малі оригінали — з upload.wikimedia.org (замір API 17.11: обидва).
 */
export const MEDIA_HOSTS: ReadonlySet<string> = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "SlipstreamAdmin/1.0 (F1 fan site; photo picker)";
export const SOURCE_WIDTHS = [960, 1280] as const;

export type Candidate = {
  title: string;
  page: string;
  thumb: string;
  width: number;
  height: number;
  license: string;
  author: string;
  verdict: LicenseVerdict;
};

type ImageInfo = {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};
type Page = { title?: string; index?: number; imageinfo?: ImageInfo[] };

/** «<a href=…>Lukas Raich</a>» → «Lukas Raich»; сутності — базові. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

export function toCandidate(p: Page): Candidate | null {
  const ii = p.imageinfo?.[0];
  if (!p.title || !ii?.thumburl || !ii.descriptionurl || !ii.width || !ii.height || !PHOTO_MIME.has(ii.mime ?? "")) return null;
  if (!MEDIA_HOSTS.has(new URL(ii.thumburl).hostname)) return null;
  const meta = ii.extmetadata ?? {};
  const license = plainText(meta.LicenseShortName?.value ?? "");
  const nonFree = (meta.NonFree?.value ?? "").toLowerCase() === "true";
  return {
    title: p.title.replace(/^File:/, ""),
    page: ii.descriptionurl,
    thumb: ii.thumburl,
    width: ii.width,
    height: ii.height,
    license,
    author: plainText(meta.Artist?.value ?? "") || "невідомий автор",
    verdict: classifyLicense(license, nonFree),
  };
}

async function query(params: Record<string, string>, fetchImpl: typeof fetch): Promise<Page[]> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|NonFree",
    ...params,
  }))
    url.searchParams.set(k, v);
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Commons: ${res.status}`);
  const data = (await res.json()) as { query?: { pages?: Page[] } };
  return (data.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** Пошук фото (простір імен «Файл»), прев'ю 480 px. */
export async function searchCommons(text: string, fetchImpl: typeof fetch = fetch): Promise<Candidate[]> {
  const q = text.trim().slice(0, 200);
  if (!q) return [];
  const pages = await query({ generator: "search", gsrnamespace: "6", gsrsearch: `${q} filetype:bitmap`, gsrlimit: "24", iiurlwidth: "480" }, fetchImpl);
  return pages.map(toCandidate).filter((c): c is Candidate => c !== null);
}

/** Один файл за назвою: мініатюра потрібної стандартної ширини (для нарізки) і дані для підпису. */
export async function commonsFile(title: string, width: (typeof SOURCE_WIDTHS)[number], fetchImpl: typeof fetch = fetch): Promise<Candidate | null> {
  const name = title.replace(/^File:/i, "").trim();
  if (!name || name.length > 240 || /[#<>[\]|{}]/.test(name)) return null;
  const [page] = await query({ titles: `File:${name}`, iiurlwidth: String(width) }, fetchImpl);
  return page ? toCandidate(page) : null;
}

/** Завантаження мініатюри (≤ 15 МБ, лише домени Wikimedia — і після редиректів). */
export async function downloadThumb(thumb: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const url = new URL(thumb);
  if (url.protocol !== "https:" || !MEDIA_HOSTS.has(url.hostname)) throw new Error("не Commons");
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (res.url && !MEDIA_HOSTS.has(new URL(res.url).hostname)) throw new Error("не Commons");
  if (!res.ok) throw new Error(`Commons: ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 15_000_000) throw new Error("завеликий файл");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 15_000_000) throw new Error("завеликий файл");
  return buf;
}
