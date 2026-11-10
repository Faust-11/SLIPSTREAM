"use client";

import { useSyncExternalStore } from "react";
import { nextTheme, resolveTheme, writeStoredTheme, type ThemeChoice } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function getSnapshot(): ThemeChoice {
  return resolveTheme(document.documentElement.getAttribute("data-theme"), window.matchMedia(DARK_QUERY).matches);
}

// На сервері тема невідома: до гідратації — нейтральний стан, щоб не було розбіжності розмітки.
function getServerSnapshot(): ThemeChoice | null {
  return null;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ThemeToggle({ labels, className }: { labels: { toLight: string; toDark: string }; className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = theme === "dark" ? labels.toLight : labels.toDark;

  function toggle() {
    const next = nextTheme(getSnapshot());
    document.documentElement.setAttribute("data-theme", next);
    writeStoredTheme(safeStorage(), next);
  }

  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
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
