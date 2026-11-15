import { crop4x5, cropRatio, squareFocus, squareTop, type Box, type Focus } from "./crop";

/**
 * Формати фото сайту — з scripts/curated і scripts/snapshot (заміри 15.11, план 7b). Кожен: кадр, ширини, висоти,
 * якість WebP, імена файлів. Нарізка (sharp) — render.ts; запис у JSON — slots.ts.
 */
export type Variant = { name: string; width: number; height: number };
export type FormatPlan = { crop: Box | null; variants: Variant[]; quality: number };
export type FormatKind = "avatar" | "driverHero" | "teamCard" | "wideHero" | "seasonCard" | "storyMedia";

/** Мінімальна ширина джерела (після кадру), менше — відмова. */
export const MIN_SOURCE: Record<FormatKind, number> = {
  avatar: 96,
  driverHero: 300, // driver_hero.py MIN_WIDTH
  teamCard: 480,
  wideHero: 960, // season_heroes.py / circuit_heroes.py MIN_WIDTH (= HERO_MIN_WIDTH сайту)
  seasonCard: 280,
  storyMedia: 480,
};

const WIDE = [1280, 800, 480];

/** base — шлях без розширення й суфікса розміру, напр. "/img/drivers/senna". */
export function planFormat(kind: FormatKind, w: number, h: number, base: string, focus: Focus): FormatPlan {
  switch (kind) {
    case "avatar": {
      return { crop: squareTop(w, h), variants: [{ name: `${base}-96.webp`, width: 96, height: 96 }], quality: 80 };
    }
    case "driverHero": {
      // driver_hero.py: імена за номінальною шириною (420/640), фактична — менша з номінальної й кадру; 640 — лише від 520.
      const crop = crop4x5(w, h, 0.2);
      const sizes: [number, number][] = [[420, Math.min(420, crop.width)]];
      if (crop.width >= 520) sizes.push([640, Math.min(640, crop.width)]);
      return {
        crop,
        variants: sizes.map(([nominal, tw]) => ({ name: `${base}-${nominal}.webp`, width: tw, height: Math.floor((tw * 5) / 4) })),
        quality: 66,
      };
    }
    case "teamCard": {
      // scripts/snapshot/teams.py: 480×300 і 256×160, якість 78.
      return {
        crop: cropRatio(w, h, 1.6, focus),
        variants: [
          { name: `${base}-480.webp`, width: 480, height: 300 },
          { name: `${base}-256.webp`, width: 256, height: 160 },
        ],
        quality: 78,
      };
    }
    case "seasonCard": {
      // season_photos.py: квадрат за точкою фокусу, full = min(560, сторона), small = 280; якість 72.
      const crop = squareFocus(w, h, focus);
      const full = Math.min(560, crop.width);
      return {
        crop,
        variants: [
          { name: `${base}-full.webp`, width: full, height: full },
          { name: `${base}-small.webp`, width: Math.min(280, full), height: Math.min(280, full) },
        ],
        quality: 72,
      };
    }
    case "wideHero":
    case "storyMedia": {
      // hero_photos.py: без кадру (фокус — CSS object-position у JSON), ширини 1280/800/480 не ширші за джерело, якість 72.
      // Фото історій — той самий набір ширин (заміри файлів: m1-800 = 800×522, пропорції джерела).
      const name = (x: number) => (kind === "wideHero" ? `${base}-hero-${x}.webp` : `${base}-${x}.webp`);
      return {
        crop: null,
        variants: WIDE.map((x) => {
          const tw = Math.min(x, w);
          return { name: name(x), width: tw, height: Math.round((h * tw) / w) };
        }),
        quality: 72,
      };
    }
  }
}
