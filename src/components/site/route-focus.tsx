"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef } from "react";

/** Позначка «після переходу сфокусувати зміст» — для зміни мови, коли кореневий layout монтується заново. */
export const FOCUS_MAIN_FLAG = "ss-focus-main";

function focusMain() {
  document.getElementById("main")?.focus({ preventScroll: true });
}

/**
 * Після клієнтського переходу фокус — на початок змісту (`#main`), а не на <body>:
 * інакше наступний Tab з клавіатури проскакує skip-link і починає зі шапки.
 * - Порівнюємо з попереднім маршрутом (а не прапорцем «перший рендер»): у dev StrictMode двічі
 *   запускає ефект, і прапорець переводив фокус на зміст уже при першому завантаженні.
 * - Зміна мови перемонтовує [lang]/layout (сегменти під ним ті самі) — її позначає перемикач мови.
 */
export function RouteFocus() {
  const route = useSelectedLayoutSegments().join("/");
  const prev = useRef(route);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FOCUS_MAIN_FLAG)) {
        sessionStorage.removeItem(FOCUS_MAIN_FLAG);
        focusMain();
      }
    } catch {
      // сховище недоступне — фокус лишиться за замовчуванням
    }
  }, []);

  useEffect(() => {
    if (prev.current === route) return;
    prev.current = route;
    focusMain();
  }, [route]);

  return null;
}
