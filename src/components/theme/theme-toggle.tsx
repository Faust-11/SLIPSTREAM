"use client";

import { useEffect } from "react";
import {
  THEME_STORAGE_KEY,
  applyThemeColor,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  safeStorage,
  writeStoredTheme,
} from "@/lib/theme";

function currentTheme() {
  return resolveTheme(
    document.documentElement.getAttribute("data-theme"),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
}

/**
 * Обидві іконки й обидва підписи — у розмітці; видимий стан обирає CSS за чинною темою
 * (globals.css, `.theme-toggle`). Тож сервер і клієнт рендерять однаково, і до гідратації
 * кнопка вже показує правильну дію.
 */
export function ThemeToggle({
  labels,
  className = "",
  withText = false,
}: {
  labels: { toLight: string; toDark: string; text?: string };
  className?: string;
  /** Видимий текст (мобільна панель) замість лише іконки. */
  withText?: boolean;
}) {
  // Колір панелі браузера — за збереженим вибором; вибір в іншій вкладці — застосувати й тут.
  useEffect(() => {
    applyThemeColor(readStoredTheme(safeStorage()));
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const theme = readStoredTheme(safeStorage());
      if (theme) document.documentElement.setAttribute("data-theme", theme);
      else document.documentElement.removeAttribute("data-theme");
      applyThemeColor(theme);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggle() {
    const next = nextTheme(currentTheme());
    document.documentElement.setAttribute("data-theme", next);
    writeStoredTheme(safeStorage(), next);
    applyThemeColor(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle ${className}`}
    >
      <span className="tt-to-light">
        {!withText && <SunIcon />}
        <span className={withText ? undefined : "sr-only"}>{labels.toLight}</span>
      </span>
      <span className="tt-to-dark">
        {!withText && <MoonIcon />}
        <span className={withText ? undefined : "sr-only"}>{labels.toDark}</span>
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
    </svg>
  );
}
