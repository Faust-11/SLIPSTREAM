/**
 * Контракт даних довідника. Зараз джерело — знімок у репозиторії (`src/data/snapshot/*.json`),
 * у фазі 2 — схема `f1` у Supabase; сигнатури шару доступу (`src/lib/data/*.ts`) при цьому не змінюються.
 */

export type L10n = { en: string; uk: string };

/** Атрибуція вільного фото (CC BY / BY-SA вимагають автора, ліцензію й посилання). */
export type Credit = { page: string; author: string; license: string };

export type SnapshotDriver = {
  id: string;
  name: L10n;
  /** Прізвище для карток (явно в даних, а не «останнє слово» — щоб не ламати складені прізвища). */
  surname: L10n;
  /** 1–2 великі літери з англійського імені — замість фото, коли вільного немає. */
  initials: string;
  /** `/img/drivers/<id>.jpg` (112×112) або `null`. */
  avatar: string | null;
};

export type TeamSnapshot = {
  /** Слаг назви: "mclaren", "red-bull", "alfa-romeo". */
  id: string;
  /** Коротка назва, як у макеті: "Racing Bulls", "Haas". */
  name: string;
  /** Повна назва в Jolpica ("Haas F1 Team") — для пошуку. */
  fullName: string;
  /** Назви кирилицею (укр./рос.) — лише для пошуку, на сторінці не показуються. */
  aliases: string[];
  /** Конструктори Jolpica, злиті в цю команду (пари «шасі-двигун»): контракт-тест фази 2. */
  refs: string[];
  country: L10n;
  /** ISO 3166-1 alpha-3 ("GBR") — заглушка картки без фото, як у макеті. */
  countryCode: string;
  /** Діапазони сезонів участі, відсортовані, без перетинів. */
  seasons: [number, number][];
  grandsPrix: number;
  wins: number;
  titles: number;
  /** Лише в команд поточного сезону: позиція в Кубку конструкторів, колір, пілоти останньої гонки. */
  current: null | { position: number; color: string; drivers: SnapshotDriver[] };
  photo: null | { src: string; width: 480; height: 300; credit: Credit };
};

export type TeamsSnapshot = {
  /** ISO-дата останньої гонки, після якої зроблено знімок. */
  asOf: string;
  /** Порядок — як у макеті: перемоги ↓, потім Гран-прі ↓. */
  teams: TeamSnapshot[];
  /** Атрибуція аватарів пілотів, показаних у картках. */
  avatarCredits: Record<string, Credit>;
};
