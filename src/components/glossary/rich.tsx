import { Fragment, type ReactNode } from "react";
import type { Term as TermData } from "@/lib/glossary/terms";
import type { Inline } from "@/lib/stories/markdown";
import { Term, type TermLabels } from "./term";

/** Інлайн-текст сторінок поза історіями (жирний, курсив, терміни-підказки); виноски тут не вживаються. */
export function Rich({ c, terms, t }: { c: Inline[]; terms: Record<string, TermData>; t: TermLabels }): ReactNode {
  return c.map((x, i) => {
    if (x.t === "text") return <Fragment key={i}>{x.v}</Fragment>;
    if (x.t === "fn") return null;
    if (x.t === "term") {
      const term = terms[x.id];
      return term ? (
        <Term key={i} term={term} t={t}>
          {x.v}
        </Term>
      ) : (
        <Fragment key={i}>{x.v}</Fragment>
      );
    }
    const Tag = x.t === "b" ? "strong" : "em";
    return (
      <Tag key={i}>
        <Rich c={x.c} terms={terms} t={t} />
      </Tag>
    );
  });
}
