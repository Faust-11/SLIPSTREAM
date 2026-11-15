import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import type { Category, StoryCard as Card } from "@/lib/stories/content";
import { Meter, type MeterLabels } from "./meter";

export type CardLabels = MeterLabels & { category: Record<Category, string>; read: string };

/** Штамп картки: рік (кружок), місце, рубрика (або kicker історії). */
export function Tagline({ c, t }: { c: Card; t: CardLabels }) {
  return (
    <p className="st-tagline">
      {c.year !== null && <span className="st-yr num">{c.year}</span>}
      <span>{[c.place, c.kicker ?? t.category[c.category]].filter(Boolean).join(" · ")}</span>
    </p>
  );
}

/**
 * Картка історії. Посилання — лише заголовок (розтягнутий на всю картку через ::after), щоб назва посилання була
 * короткою, а не весь текст картки (модерн-настанова «Card»: окремі посилання всередині картки не потрібні).
 */
export function StoryCard({ c, locale, t, featured = false, eager = false }: { c: Card; locale: Locale; t: CardLabels; featured?: boolean; eager?: boolean }) {
  const href = localizedPath(`/stories/${c.slug}`, locale);
  const Heading = featured ? "h2" : "h3";
  return (
    <article className={featured ? "st-card st-feat" : "st-card"} data-cat={c.category} id={`story-${c.slug}`}>
      {c.hero && (
        <figure className="st-ph">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.hero.src}
            srcSet={c.hero.srcSet}
            sizes={featured ? "(width <= 900px) 100vw, 55vw" : "(width <= 640px) 100vw, 50vw"}
            width={c.hero.width}
            height={c.hero.height}
            alt=""
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : undefined}
            decoding="async"
            style={c.hero.focus ? { objectPosition: c.hero.focus } : undefined}
          />
        </figure>
      )}
      <div className="st-txt">
        <Tagline c={c} t={t} />
        <Heading className="display">
          <a href={href} className="st-link">
            {c.title.main}
            {c.title.accent && (
              <>
                <span className="sr-only">: </span>
                <span className="st-acc">{c.title.accent}</span>
              </>
            )}
          </a>
        </Heading>
        <p className="st-dek">{c.dek}</p>
        <Meter m={c.meter} locale={locale} t={t} compact />
        <p className="st-go" aria-hidden="true">
          {fill(t.read, { n: c.minutes })}
        </p>
      </div>
    </article>
  );
}
