/** Рубрики фільтра списку історій (спільні для серверної сторінки й клієнтського фільтра — не з модуля "use client"). */
export const STORY_FILTERS = ["all", "scandal", "sensation", "history", "explainer", "tech"] as const;
export type StoryFilter = (typeof STORY_FILTERS)[number];
