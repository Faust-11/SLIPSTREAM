"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Після клієнтського переходу фокус — на початок змісту (`#main`), а не на <body>:
 * інакше наступний Tab з клавіатури проскакує skip-link і починає зі шапки.
 */
export function RouteFocus() {
  const route = useSelectedLayoutSegments().join("/");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route]);
  return null;
}
