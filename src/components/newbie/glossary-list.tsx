"use client";

import { useDeferredValue, useId, useState } from "react";
import { useHydrated } from "@/components/calendar/clock";
import { fill } from "@/i18n/fill";

export type GlossaryItem = { id: string; term: string; orig: string | null; def: string; k: string };
export type GlossaryLabels = { search: string; placeholder: string; count: string; empty: string };

/** Нормалізація для пошуку: регістр, лапки, різні апострофи, ё/е не потрібні (uk/en). */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[«»“”"]/g, "")
    .replace(/[’ʼ`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(items: GlossaryItem[], q: string): GlossaryItem[] {
  const s = norm(q);
  return s ? items.filter((it) => it.k.includes(s)) : items;
}

/**
 * Словник з пошуком (макет «Новачкам»). Без JS — увесь список (поле пошуку з'являється лише після гідратації, щоб не було
 * мертвого поля). Кожен запис — `#g-<id>`: туди веде «У словнику →» з підказок у текстах.
 */
export function GlossaryList({ items, t }: { items: GlossaryItem[]; t: GlossaryLabels }) {
  const hydrated = useHydrated();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const shown = new Set(matches(items, dq).map((it) => it.id));
  const inputId = useId();
  return (
    <>
      {hydrated && (
        <div className="nb-gl-bar" role="search">
          <label className="sr-only" htmlFor={inputId}>
            {t.search}
          </label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t.placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="nb-gl-count num" role="status">
            {fill(t.count, { n: shown.size, total: items.length })}
          </span>
        </div>
      )}
      <dl className="nb-gl">
        {items.map((it) => (
          <div key={it.id} className="nb-gl-item" id={`g-${it.id}`} hidden={!shown.has(it.id)}>
            <dt>
              <span>{it.term}</span>
              {it.orig && (
                <span className="nb-gl-alt" lang="en">
                  {it.orig}
                </span>
              )}
            </dt>
            <dd>{it.def}</dd>
          </div>
        ))}
      </dl>
      {shown.size === 0 && <p className="nb-gl-empty">{t.empty}</p>}
    </>
  );
}
