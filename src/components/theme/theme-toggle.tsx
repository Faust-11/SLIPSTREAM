"use client";

import { useEffect } from "react";
import { THEME_STORAGE_KEY, nextTheme, readStoredTheme, resolveTheme, writeStoredTheme } from "@/lib/theme";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
export function ThemeToggle({ labels, className = "" }: { labels: { toLight: string; toDark: string }; className?: string }) {
  // Вибір в іншій вкладці — застосувати й тут.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const theme = readStoredTheme(safeStorage());
      if (theme) document.documentElement.setAttribute("data-theme", theme);
      else document.documentElement.removeAttribute("data-theme");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggle() {
    const next = nextTheme(currentTheme());
    document.documentElement.setAttribute("data-theme", next);
    writeStoredTheme(safeStorage(), next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle inline-grid min-h-[30px] min-w-[30px] cursor-pointer place-items-center p-1.5 ${className}`}
    >
      <span className="tt-to-light">
        <SunIcon />
        <span className="sr-only">{labels.toLight}</span>
      </span>
      <span className="tt-to-dark">
        <MoonIcon />
        <span className="sr-only">{labels.toDark}</span>
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
