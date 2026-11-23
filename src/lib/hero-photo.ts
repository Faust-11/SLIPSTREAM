/**
 * Фон шапок головної й сторінки прогнозів: стартова решітка, Спа 2008 (Mark McArdle, CC BY-SA 2.0, Wikimedia Commons).
 * Автор і ліцензія — у PageCredits унизу кожної сторінки, що її показує (`credit`).
 */
export const HERO_PHOTO = {
  src: "/img/home/grid-1100.webp",
  srcSet: "/img/home/grid-480.webp 480w, /img/home/grid-640.webp 640w, /img/home/grid-1100.webp 1100w, /img/home/grid-1600.webp 1600w",
  width: 1600,
  height: 1067,
  credit: {
    label: "Spa-Francorchamps 2008",
    href: "https://commons.wikimedia.org/wiki/File:Spa_2008_before_start.jpg",
    author: "Mark McArdle",
    license: "CC BY-SA 2.0",
  },
} as const;
