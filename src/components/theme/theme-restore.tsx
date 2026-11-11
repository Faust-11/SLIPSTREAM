"use client";

import { useLayoutEffect } from "react";
import { restoreHtmlAttributes, safeStorage } from "@/lib/theme";

/** Повертає `data-js` і збережену тему після перемонтування `<html>` — до першого кадру (layout effect). */
export function ThemeRestore() {
  useLayoutEffect(() => {
    restoreHtmlAttributes(document.documentElement, safeStorage());
  }, []);
  return null;
}
