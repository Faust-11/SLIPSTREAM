import "server-only";
import sharp, { type Metadata } from "sharp";
import { MIN_SOURCE, planFormat, type FormatKind, type Variant } from "./formats";
import type { Focus } from "./crop";

/** Будь-яке зображення не більше 40 Мпікс (захист від «бомб» — сотні тисяч пікселів у маленькому файлі). */
const MAX_PIXELS = 40_000_000;

export class PhotoError extends Error {}

export type Rendered = Variant & { data: Uint8Array };

/**
 * Нарізка фото в усі файли формату. WebP з sharp: метадані (EXIF, GPS, ICC) не копіюються — sharp їх не пише без
 * withMetadata(); орієнтацію з EXIF застосовуємо до кадрування (rotate()), щоб телефонні фото не лягли на бік.
 */
export async function renderFormat(input: Uint8Array, kind: FormatKind, base: string, focus: Focus): Promise<Rendered[]> {
  let meta: Metadata;
  const img = () => sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
  try {
    meta = await img().metadata();
  } catch {
    throw new PhotoError("файл не є зображенням або пошкоджений");
  }
  // rotate() враховує EXIF лише в конвеєрі; розміри для кадру — з урахуванням повороту.
  const swap = (meta.orientation ?? 1) >= 5;
  const w = swap ? meta.height : meta.width;
  const h = swap ? meta.width : meta.height;
  if (!w || !h) throw new PhotoError("не вдалося визначити розмір зображення");
  const plan = planFormat(kind, w, h, base, focus);
  const cropW = plan.crop?.width ?? w;
  if (cropW < MIN_SOURCE[kind]) throw new PhotoError(`замале зображення: ${cropW} px, треба щонайменше ${MIN_SOURCE[kind]}`);

  return Promise.all(
    plan.variants.map(async (v) => {
      let p = img();
      if (plan.crop) p = p.extract(plan.crop);
      const data = await p
        .resize(v.width, v.height, { fit: "fill", kernel: "lanczos3" })
        .webp({ quality: plan.quality, effort: 6 })
        .toBuffer();
      return { ...v, data: new Uint8Array(data) };
    }),
  );
}
