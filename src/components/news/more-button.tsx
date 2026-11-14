"use client";

import { useState } from "react";
import { fill } from "@/i18n/fill";

/**
 * «Показати ще»: сервер рендерить увесь список, записи після першої сторінки мають data-page ≥ 1 і з JS сховані CSS
 * (без JS видно все). Кнопка відкриває наступну сторінку — ставить data-open на її записи (атрибут не належить React).
 */
export function MoreButton({ listId, pages, step, total, label }: { listId: string; pages: number; step: number; total: number; label: string }) {
  const [open, setOpen] = useState(1);
  if (open >= pages) return null;
  const shown = Math.min(open * step, total);
  const left = total - shown;
  const reveal = () => {
    const items = document.getElementById(listId)?.querySelectorAll<HTMLElement>(`:scope > [data-page="${open}"]`) ?? [];
    items.forEach((el) => (el.dataset.open = ""));
    // Фокус — на сам перший відкритий запис (не на його посилання: у поста це нижнє «Відкрити в Bluesky», рев'ю PR #20).
    const first = items[0];
    if (first) {
      first.tabIndex = -1;
      first.focus();
    }
    setOpen(open + 1);
  };
  return (
    <button type="button" className="nw-more" onClick={reveal}>
      {fill(label, { n: Math.min(step, left), left })}
    </button>
  );
}
