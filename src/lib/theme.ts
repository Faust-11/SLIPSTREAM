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

/** Колір панелі браузера = колір шапки (--head-bg) для теми. */
export const THEME_COLOR: Record<ThemeChoice, string> = { light: "#16181d", dark: "#07080a" };

/** Явний вибір теми — і колір панелі браузера (meta theme-color з media стоять для системної теми). */
export function applyThemeColor(theme: ThemeChoice | null): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (!meta.dataset.media) meta.dataset.media = meta.media;
    if (theme) {
      meta.content = THEME_COLOR[theme];
      meta.media = "";
    } else {
      meta.media = meta.dataset.media;
      meta.content = meta.dataset.media.includes("dark") ? THEME_COLOR.dark : THEME_COLOR.light;
    }
  }
}

/** localStorage або null (приватний режим, заблоковані дані сайту). */
export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Атрибути `<html>`, які ставить inline-скрипт (`data-js`, `data-theme`), — повторно після кожного
 * монтування кореневого layout: зміна мови перемонтовує `<html>`, і React стирає «чужі» атрибути
 * (замір 11.11: після UA → EN тема скидалась на системну, перемикач теми ховався).
 */
export function restoreHtmlAttributes(root: HTMLElement, storage: Storage | null): void {
  root.setAttribute("data-js", "");
  const theme = readStoredTheme(storage);
  if (theme) root.setAttribute("data-theme", theme);
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
 * (ознака, що JS працює: без нього перемикач теми прихований), а `data-list-query` — якщо в адресі
 * є стан списку (`q`/`f`/`sort`): список ховається до гідратації, щоб не показувати нефільтрований
 * (дизайн-рев'ю 11.11: на повільному телефоні ~4 с видно «не той» список). Лише на «Командах», «Пілотах» і «Трасах»:
 * знімає атрибут TeamsBrowser, і на інших сторінках він ховав би футер (code-review PR #5).
 * Без збереженого вибору `data-theme` немає — діє `prefers-color-scheme`.
 */
export const themeScriptSource = `(function(){var d=document.documentElement;d.setAttribute("data-js","");if((/(^|\\/)(teams|circuits)\\/?$/.test(location.pathname)&&/[?&](q|f|sort)=/.test(location.search))||(/(^|\\/)drivers\\/?$/.test(location.pathname)&&/[?&](q|f|d|l|sort|dir|p)=/.test(location.search)))d.setAttribute("data-list-query","");try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}})()`;
