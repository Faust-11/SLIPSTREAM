import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import type { Category, StoryCard as Card } from "@/lib/stories/content";
import { FeaturedPhoto } from "./featured-photo";
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
export function StoryCard({ c, locale, t, featured = false, meter = true }: { c: Card; locale: Locale; t: CardLabels; featured?: boolean; meter?: boolean }) {
  const href = localizedPath(`/stories/${c.slug}`, locale);
  return (
    <article className={featured ? "st-card st-feat" : "st-card"} data-cat={c.category} id={`story-${c.slug}`}>
      {c.hero && (
        <figure className="st-ph">
          {featured ? (
            <FeaturedPhoto
              src={c.hero.src}
              srcSet={c.hero.srcSet}
              sizes="(width <= 900px) 100vw, 55vw"
              width={c.hero.width}
              height={c.hero.height}
              style={c.hero.focus ? { objectPosition: c.hero.focus } : undefined}
            />
          ) : (
            // Решта — lazy: серверний <img> без lazy потрапляє в RSC-дані й передзавантажується з prefetch меню (граблі №10).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.hero.src}
              srcSet={c.hero.srcSet}
              sizes="(width <= 640px) 100vw, 50vw"
              width={c.hero.width}
              height={c.hero.height}
              alt=""
              loading="lazy"
              decoding="async"
              style={c.hero.focus ? { objectPosition: c.hero.focus } : undefined}
            />
          )}
        </figure>
      )}
      <div className="st-txt">
        <Tagline c={c} t={t} />
        {/* Усі картки — h3 під заголовком розділу (h2), і вибрана теж: інакше решта «належали б» їй у структурі. */}
        <h3 className="display">
          <a href={href} className="st-link">
            {c.title.main}
            {c.title.accent && (
              <>
                <span className="sr-only">: </span>
                <span className="st-acc">{c.title.accent}</span>
              </>
            )}
          </a>
        </h3>
        <p className="st-dek">{c.dek}</p>
        {meter && <Meter m={c.meter} locale={locale} t={t} compact />}
        <p className="st-go" aria-hidden="true">
          {fill(t.read, { n: c.minutes })}
        </p>
      </div>
    </article>
  );
}
