import "server-only";
import type { Credit } from "@/lib/data/types";
import { commonsFile, downloadThumb } from "./commons";
import { classifyLicense } from "./license";

/**
 * Звідки береться зображення для публікації (7b; винесено в 7c, щоб фото сайту й фото історій перевіряли однаково).
 * З форми — лише вибір: файл Commons (автор, ліцензія — з Commons на сервері) або власне фото (≤ 4 МБ — ліміт тіла
 * функції Vercel 4,5 МБ; браузер заздалегідь зменшує до 2560 px) з автором, ліцензією, посиланням і підтвердженням прав.
 */
export const MAX_UPLOAD = 4 * 1024 * 1024;
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Ліцензії власного фото — рівно ті, що у формі (вільний текст не приймаємо: «Attribution-NoDerivatives» класифікатор
 *  пропустив би як «вільну» — рев'ю 7b). */
export const UPLOAD_LICENSES = ["CC BY 4.0", "CC BY-SA 4.0", "CC0", "CC BY-NC 4.0"] as const;

export type Acquired = { ok: true; bytes: Uint8Array; credit: Credit; nc: boolean } | { ok: false; code: "commons" | "license" | "upload-file" | "upload-fields" };

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

export async function acquireImage(form: FormData): Promise<Acquired> {
  if (str(form, "source") === "upload") {
    const file = form.get("file");
    const author = str(form, "author", 200);
    const license = str(form, "license", 100);
    const page = str(form, "page", 500);
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD || !UPLOAD_TYPES.has(file.type)) return { ok: false, code: "upload-file" };
    if (!author || !(UPLOAD_LICENSES as readonly string[]).includes(license) || form.get("rights") !== "on" || !/^https:\/\/[^\s]+$/.test(page)) return { ok: false, code: "upload-fields" };
    const verdict = classifyLicense(license);
    if (verdict.level === "no") return { ok: false, code: "license" };
    return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()), credit: { page, author, license }, nc: verdict.level === "nc" };
  }
  const file = await commonsFile(str(form, "title", 240), 1280).catch(() => null);
  if (!file) return { ok: false, code: "commons" };
  if (file.verdict.level === "no") return { ok: false, code: "license" };
  const bytes = await downloadThumb(file.thumb).catch(() => null);
  if (!bytes) return { ok: false, code: "commons" };
  return { ok: true, bytes, credit: { page: file.page, author: file.author, license: file.license }, nc: file.verdict.level === "nc" };
}
