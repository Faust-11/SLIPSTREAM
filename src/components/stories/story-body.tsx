import { Fragment, type ReactNode } from "react";
import { fill } from "@/i18n/fill";
import type { StoryPage } from "@/lib/stories/content";
import type { Block, Inline } from "@/lib/stories/markdown";

export type BodyLabels = { status: Record<"ok" | "one" | "dis", string>; fnLabel: string };

/**
 * Виноска: номери джерел (кожен — посилання на свій пункт переліку). Статус «одне джерело» / «розходяться» — значком
 * і прихованим текстом (не лише кольором і не лише title — макет мав тільки title, недоступний з клавіатури й дотику).
 */
function Footnote({ id, story, t }: { id: string; story: StoryPage; t: BodyLabels }) {
  const c = story.claims[id];
  if (!c) return null;
  const nums = c.sources;
  return (
    <sup className={`st-fn st-fn-${c.status}`}>
      {c.status !== "ok" && (
        <i className={`st-m st-m-${c.status}`} aria-hidden="true">
          {c.status === "one" ? "1" : "?"}
        </i>
      )}
      {c.status !== "ok" && <span className="sr-only">{t.status[c.status]}: </span>}
      {nums.map((n, i) => (
        <Fragment key={n}>
          {i > 0 && <span aria-hidden="true">,</span>}
          <a href={`#s${n}`} aria-label={fill(t.fnLabel, { n })}>
            {n}
          </a>
        </Fragment>
      ))}
    </sup>
  );
}

export function InlineText({ c, story, t }: { c: Inline[]; story: StoryPage; t: BodyLabels }): ReactNode {
  return c.map((x, i) => {
    if (x.t === "text") return <Fragment key={i}>{x.v}</Fragment>;
    if (x.t === "fn") return <Footnote key={i} id={x.claim} story={story} t={t} />;
    const Tag = x.t === "b" ? "strong" : "em";
    return (
      <Tag key={i}>
        <InlineText c={x.c} story={story} t={t} />
      </Tag>
    );
  });
}

function Photo({ id, story }: { id: string; story: StoryPage }) {
  const m = story.media[id];
  if (!m) return null;
  return (
    // Вертикальне фото — повністю, без обрізання (обличчя різались кадром 540 px); горизонтальне — з кадром і фокусом.
    <figure className={m.height > m.width ? "st-inph st-inph-port" : "st-inph"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.src}
        srcSet={m.srcSet}
        sizes="(width <= 760px) 100vw, 720px"
        width={m.width}
        height={m.height}
        alt={m.alt}
        loading="lazy"
        decoding="async"
        style={m.focus ? { objectPosition: m.focus } : undefined}
      />
      <figcaption>{m.caption}</figcaption>
    </figure>
  );
}

/** Текст історії: глави (section з id для змісту), абзаци, цитати, фото, «Коротко», хронологія. Віджети [[block:]] — пізніше. */
export function StoryBody({ story, t }: { story: StoryPage; t: BodyLabels }) {
  const chapters: { id: string | null; title: string | null; blocks: Block[] }[] = [{ id: null, title: null, blocks: [] }];
  for (const b of story.blocks) {
    if (b.type === "h2") chapters.push({ id: b.id, title: b.text, blocks: [] });
    else chapters[chapters.length - 1]!.blocks.push(b);
  }
  const render = (b: Block, i: number) => {
    switch (b.type) {
      case "p":
        return (
          <p key={i}>
            <InlineText c={b.c} story={story} t={t} />
          </p>
        );
      case "quote":
        return (
          <figure key={i} className="st-pull">
            <blockquote>
              <p className="st-q-orig">
                <InlineText c={b.orig} story={story} t={t} />
              </p>
              {b.tr && (
                <p className="st-q-tr">
                  <InlineText c={b.tr} story={story} t={t} />
                </p>
              )}
            </blockquote>
            {b.cite && <figcaption>{b.cite}</figcaption>}
          </figure>
        );
      case "media":
        return <Photo key={i} id={b.id} story={story} />;
      case "tldr":
        return (
          <ol key={i} className="st-tldr" role="list">
            {b.items.map((it, j) => (
              <li key={j}>
                {/* Один елемент сітки: інакше кожен шматок тексту й виноска стають окремою клітинкою (рев'ю 15.11). */}
                <span>
                  <InlineText c={it} story={story} t={t} />
                </span>
              </li>
            ))}
          </ol>
        );
      case "timeline":
        return (
          <ol key={i} className="st-tl" role="list">
            {b.items.map((it, j) => (
              <li key={j}>
                <span className="st-tl-date num">{it.date}</span>
                <span>
                  <InlineText c={it.c} story={story} t={t} />
                </span>
              </li>
            ))}
          </ol>
        );
      default:
        return null;
    }
  };
  return (
    <>
      {chapters.map((ch, k) =>
        ch.id === null ? (
          ch.blocks.length > 0 && <div key={k} className="st-ch">{ch.blocks.map(render)}</div>
        ) : (
          <section key={k} id={ch.id} className="st-ch" tabIndex={-1} aria-labelledby={`${ch.id}-h`}>
            <h2 id={`${ch.id}-h`} className="display">
              {ch.title}
            </h2>
            {ch.blocks.map(render)}
          </section>
        ),
      )}
    </>
  );
}
