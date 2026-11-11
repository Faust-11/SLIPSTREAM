import type { Locale } from "./config";

/** Тексти сторінок помилок — окремо від словників: потрапляють у клієнтський бандл (error.tsx). */
export const ERROR_TEXT: Record<Locale, { title: string; retry: string; home: string }> = {
  en: { title: "Something went wrong", retry: "Try again", home: "Go to the home page" },
  uk: { title: "Щось пішло не так", retry: "Спробувати ще раз", home: "На головну" },
};
