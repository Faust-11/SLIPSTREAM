"use client";

import { useState } from "react";

/**
 * Сторінки заголовків (відгук користувача 15.11: колонки «Видання» і «Журналісти» однієї висоти — список не росте,
 * а гортається сторінками). Сервер рендерить усі записи з data-page, перша сторінка — з data-open; без JS видно все.
 * Кнопка ставить data-open записам своєї сторінки (атрибут не належить React — як було з «Показати ще»).
 */
export function NewsPager({ listId, pages, label }: { listId: string; pages: number; label: string }) {
  const [cur, setCur] = useState(0);
  if (pages < 2) return null;
  const go = (i: number) => {
    const list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll<HTMLElement>(":scope > li").forEach((li) => li.toggleAttribute("data-open", li.dataset.page === String(i)));
    setCur(i);
    // Початок списку — у полі зору (кнопки внизу колонки, нова сторінка може бути коротшою за попередню).
    if (list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  };
  return (
    <div className="nw-pager" role="group" aria-label={label}>
      {Array.from({ length: pages }, (_, i) => (
        <button key={i} type="button" className="nw-pg num" aria-pressed={cur === i} onClick={() => go(i)}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}
