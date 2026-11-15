import { useId, type ReactNode } from "react";
import type { Term as TermData } from "@/lib/glossary/terms";

export type TermLabels = { more: string; href: (id: string) => string };

/**
 * Підказка терміна словника (фаза 5b). Тригер — кнопка в рядку тексту з `popovertarget`, віконце — `popover="auto"`
 * одразу після кнопки (читачі екрана доходять до нього наступним кроком). Працює без JS: відкриває клік/дотик/Enter,
 * закриває Esc або клік поза ним (light dismiss), фокус повертається на кнопку. Розташування — CSS anchor positioning
 * (неявний якір popovertarget), без підтримки — UA-центр екрана (guides/ui-atoms/position-aware-tooltips.md).
 * Не hover-only `tabindex=0`, як у макеті головної: недоступно з дотику й клавіатури.
 * `shared` — кнопка без власного віконця (таблиці: DNF у багатьох рядках) → віконце один раз через <TermPopover>.
 */
export function Term({ term, children, t, shared = false, box = false }: { term: TermData; children: ReactNode; t: TermLabels; shared?: boolean; box?: boolean }) {
  const own = `gt-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-${term.id}`;
  const id = shared ? sharedId(term.id) : own;
  return (
    <>
      {/* box — поза реченням (заголовок таблиці, клітинка статусу): ціль ≥ 24 px (target-size), бо виняток «у рядку тексту» не діє. */}
      <button type="button" className={box ? "gt-t gt-box" : "gt-t"} popoverTarget={id} data-term={term.id}>
        {children}
      </button>
      {!shared && <TermBox id={id} term={term} t={t} />}
    </>
  );
}

export const sharedId = (termId: string) => `gt-s-${termId}`;

/** Спільне віконце для кількох кнопок `shared` (ставиться один раз на сторінку). */
export function TermPopover({ term, t }: { term: TermData; t: TermLabels }) {
  return <TermBox id={sharedId(term.id)} term={term} t={t} />;
}

function TermBox({ id, term, t }: { id: string; term: TermData; t: TermLabels }) {
  return (
    <span id={id} popover="auto" className="gt-tip">
      <span className="gt-in">
        <span className="gt-h">
          <b>{term.term}</b>
          {term.orig && (
            <span className="gt-orig" lang="en">
              {term.orig}
            </span>
          )}
        </span>
        <span className="gt-d">{term.def}</span>
        <a className="gt-more" href={t.href(term.id)}>
          {t.more}
        </a>
      </span>
    </span>
  );
}
