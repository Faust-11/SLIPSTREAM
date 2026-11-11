export type ThemeChoice = "light" | "dark";

export const THEME_STORAGE_KEY = "ss-theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark";
}

/** Збережений вибір відвідувача; некоректні значення й недоступне сховище → null. */
export function readStoredTheme(storage: Storage | null): ThemeChoice | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : null;
  } catch {
    return null;
  }
}

/** Зберігає вибір; приватний режим чи заборона сховища не ламають перемикач. */
export function writeStoredTheme(storage: Storage | null, theme: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // вибір діятиме до перезавантаження сторінки
  }
}

export function nextTheme(current: ThemeChoice): ThemeChoice {
  return current === "dark" ? "light" : "dark";
}

/** Чинна тема: атрибут `data-theme` (явний вибір) або системна. */
export function resolveTheme(attribute: string | null | undefined, prefersDark: boolean): ThemeChoice {
  if (isThemeChoice(attribute)) return attribute;
  return prefersDark ? "dark" : "light";
}

/**
 * Inline-скрипт для `<head>`: до першого кадру ставить `data-theme` зі сховища і `data-js`
 * (ознака, що JS працює: без нього перемикач теми прихований).
 * Без збереженого вибору `data-theme` немає — діє `prefers-color-scheme`.
 */
export const themeScriptSource = `(function(){var d=document.documentElement;d.setAttribute("data-js","");try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}})()`;
