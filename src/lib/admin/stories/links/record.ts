import { parseStoryJson, serializeStoryJson } from "../format";
import { ARCHIVE_URL_RE } from "./archive";

/**
 * Запис знайдених копій у story.json (7c, задача 7): `sources[].archive`. Адреси копій приходять із браузера, тож тут вони
 * перевіряються: це знімок на web.archive.org САМЕ цього джерела (той самий хост без www), джерело існує, а вже записану
 * копію не перезаписуємо. Решту файлу не чіпаємо (байт-у-байт, як у редакторі).
 */
const bare = (host: string): string => host.replace(/^www\./, "").toLowerCase();

/** Хост оригіналу, що зашитий у адресі знімка: https://web.archive.org/web/<ts>/<оригінал>. */
export function archivedHost(archive: string): string | null {
  if (!ARCHIVE_URL_RE.test(archive)) return null;
  try {
    return bare(new URL(archive.replace(/^https:\/\/web\.archive\.org\/web\/\d{14}\//, "")).hostname);
  } catch {
    return null;
  }
}

export type RecordResult = { json: string; added: string[]; skipped: { id: string; reason: string }[] };

export function recordArchives(rawJson: string, copies: Record<string, string>): RecordResult {
  const { story, trailingNewline } = parseStoryJson(rawJson);
  const added: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const byId = new Map((story.sources ?? []).map((s) => [s.id, s]));
  for (const [id, archive] of Object.entries(copies)) {
    const src = byId.get(id);
    if (!src) {
      skipped.push({ id, reason: "джерела немає" });
      continue;
    }
    if (typeof src.archive === "string" && src.archive !== "") {
      skipped.push({ id, reason: "копія вже є" });
      continue;
    }
    let host: string;
    try {
      host = bare(new URL(src.url).hostname);
    } catch {
      skipped.push({ id, reason: "некоректна адреса джерела" });
      continue;
    }
    if (archivedHost(archive) !== host) {
      skipped.push({ id, reason: "копія іншого сайту" });
      continue;
    }
    src.archive = archive; // новий ключ — в кінці об'єкта джерела (після author)
    added.push(id);
  }
  return { json: added.length ? serializeStoryJson(story, trailingNewline) : rawJson, added, skipped };
}
