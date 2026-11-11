"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useActiveNav } from "./use-active-nav";

export type MenuItem = { key: string; href: string; label: string; accent?: "yellow" };

// Узгоджено з site.css (@media (width > 1140px)).
const DESKTOP = "(width > 1140px)";

export function MobileMenu({
  items,
  labels,
  extra,
}: {
  items: readonly MenuItem[];
  labels: { open: string; nav: string };
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = useActiveNav();

  // Будь-яка зміна маршруту (логотип, Back/Forward, router.push) закриває панель.
  const route = useSelectedLayoutSegments().join("/");
  const [shownRoute, setShownRoute] = useState(route);
  if (route !== shownRoute) {
    setShownRoute(route);
    setOpen(false);
  }

  // Після гідратації бургер замінює запасне посилання на розділи (див. site.css).
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "");
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Поки панель відкрита: контент під нею недосяжний (inert), сторінка не прокручується.
  useEffect(() => {
    const blocked = document.querySelectorAll<HTMLElement>("[data-mnav-inert]");
    blocked.forEach((el) => el.toggleAttribute("inert", open));
    document.body.classList.toggle("mnav-open", open);
    if (!open) {
      document.documentElement.style.removeProperty("--mnav-top");
      return;
    }

    const header = buttonRef.current?.closest(".site-head");
    const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 64;
    document.documentElement.style.setProperty("--mnav-top", `${top}px`);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const media = window.matchMedia(DESKTOP);
    const onMedia = (e: MediaQueryListEvent) => {
      if (e.matches) close(false);
    };
    document.addEventListener("keydown", onKey);
    media.addEventListener("change", onMedia);
    return () => {
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onMedia);
      blocked.forEach((el) => el.removeAttribute("inert"));
      document.body.classList.remove("mnav-open");
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="mnav-btn"
        aria-expanded={open}
        aria-controls={panelId}
        // Стала назва: стан повідомляє aria-expanded (без дублювання «Закрити меню»).
        aria-label={labels.open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon /> : <BurgerIcon />}
      </button>
      <nav
        id={panelId}
        className="mnav"
        aria-label={labels.nav}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as Element).closest("a")) close(false);
        }}
      >
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={item.accent === "yellow" ? "is-accent" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {extra}
      </nav>
    </>
  );
}

function BurgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
