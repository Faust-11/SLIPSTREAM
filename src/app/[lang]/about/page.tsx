import type { Metadata } from "next";
import { ServiceBody, ServiceHero, ServiceSection } from "@/components/service/service-layout";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getSiteCredits } from "@/lib/data/credits";
import { loadSeasonIndex } from "@/lib/data/seasons";
import circuitsJson from "@/data/curated/circuits.json";
import { getTerms } from "@/lib/glossary/terms";
import { contactEmail, serviceText } from "@/lib/service/content";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { getStoryList } from "@/lib/stories/content";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = serviceText(lang).about;
  return pageMetadata({ locale: lang, path: "/about", title: t.title, description: t.description });
}

export default async function AboutPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const all = serviceText(lang);
  const t = all.about;
  const path = (p: string) => localizedPath(p, lang);
  const [seasons, credits] = await Promise.all([loadSeasonIndex(), getSiteCredits(lang)]);
  const years = seasons.map((s) => s.year);
  const n = new Intl.NumberFormat(lang === "uk" ? "uk" : "en-GB");
  const circuits = Object.keys((circuitsJson as unknown as { places: Record<string, unknown> }).places).length;
  const email = contactEmail();
  const ids = { what: "what", data: "data", check: "check", store: "store", unofficial: "unofficial", contact: "contact" };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: t.title,
    url: new URL(path("/about"), siteUrl()).href,
    inLanguage: lang,
    about: { "@type": "WebSite", name: "Slipstream", url: new URL(path("/"), siteUrl()).href },
  };

  return (
    <div className="sv-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ServiceHero
        stamp={t.stamp}
        h1={t.h1}
        lead={t.lead}
        facts={[
          { n: n.format(years.length), label: fill(t.facts.seasons, { first: Math.min(...years), last: Math.max(...years) }) },
          { n: n.format(circuits), label: t.facts.circuits },
          { n: n.format(getStoryList(lang).length), label: t.facts.stories },
          { n: n.format(getTerms(lang).length), label: t.facts.terms },
          { n: n.format(credits.length), label: t.facts.photos },
        ]}
      />
      <ServiceBody
        idxLabel={t.idx}
        idx={[
          { id: ids.what, label: t.what.h },
          { id: ids.data, label: t.data.h },
          { id: ids.check, label: t.check.h },
          { id: ids.store, label: t.store.h },
          { id: ids.unofficial, label: t.unofficial.h },
          { id: ids.contact, label: t.contact.h },
        ]}
      >
        <ServiceSection id={ids.what} title={t.what.h}>
          <ul className="sv-list" role="list">
            {t.what.items.map((it) => (
              <li key={it.href}>
                <a href={path(it.href)}>{it.name}</a>
                <span>{it.p}</span>
              </li>
            ))}
          </ul>
        </ServiceSection>

        <ServiceSection id={ids.data} title={t.data.h}>
          {t.data.p.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="sv-soft">
            {t.data.more.split("{page}")[0]}
            <a href={path("/sources")}>{all.sources.title}</a>
            {t.data.more.split("{page}")[1]}
          </p>
        </ServiceSection>

        <ServiceSection id={ids.check} title={t.check.h}>
          <p>{t.check.p1}</p>
          <ul className="sv-marks" role="list" aria-label={t.check.marksLabel}>
            <li>
              <i className="sv-mk sv-mk-ok" aria-hidden="true">
                ✓
              </i>
              {t.check.marks.ok}
            </li>
            <li>
              <i className="sv-mk sv-mk-one" aria-hidden="true">
                1
              </i>
              {t.check.marks.one}
            </li>
            <li>
              <i className="sv-mk sv-mk-dis" aria-hidden="true">
                ?
              </i>
              {t.check.marks.dis}
            </li>
          </ul>
          <p>{t.check.p2}</p>
          <p className="sv-soft">{t.check.p3}</p>
        </ServiceSection>

        <ServiceSection id={ids.store} title={t.store.h}>
          <ul className="sv-store" role="list">
            {t.store.items.map((it) => (
              <li key={it.name}>
                <span className="sv-tag">{it.tag}</span>
                <b>{it.name}</b>
                <p>{it.p}</p>
              </li>
            ))}
          </ul>
        </ServiceSection>

        <ServiceSection id={ids.unofficial} title={t.unofficial.h}>
          <p>{t.unofficial.p}</p>
        </ServiceSection>

        <ServiceSection id={ids.contact} title={t.contact.h}>
          <div className="sv-contact" data-surface="dark">
            <p className="sv-contact-k">{t.contact.label}</p>
            {email ? (
              <p className="sv-contact-v">
                <a href={`mailto:${email}`} translate="no">
                  {email}
                </a>
              </p>
            ) : (
              <p className="sv-contact-pending">{t.contact.pending}</p>
            )}
            <p>{t.contact.p}</p>
          </div>
        </ServiceSection>
      </ServiceBody>
    </div>
  );
}
