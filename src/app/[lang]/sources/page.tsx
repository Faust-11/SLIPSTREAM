import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { CreditsSearch } from "@/components/service/credits-search";
import { ServiceBody, ServiceHero, ServiceSection } from "@/components/service/service-layout";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getSiteCredits, layoutCounts, licenseCounts } from "@/lib/data/credits";
import { loadSeasonIndex } from "@/lib/data/seasons";
import { serviceText } from "@/lib/service/content";
import { normKey } from "@/lib/service/norm";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = serviceText(lang).sources;
  return pageMetadata({ locale: lang, path: "/sources", title: t.title, description: t.description });
}

/** Частина рядка з «{page}» → текст + посилання + текст. */
function withLink(tpl: string, label: string, href: string) {
  const [a, b] = tpl.split("{page}");
  return (
    <>
      {a}
      <a href={href}>{label}</a>
      {b}
    </>
  );
}

export default async function SourcesPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const all = serviceText(lang);
  const t = all.sources;
  const path = (p: string) => localizedPath(p, lang);
  const [credits, seasons] = await Promise.all([getSiteCredits(lang), loadSeasonIndex()]);
  const nf = new Intl.NumberFormat(lang === "uk" ? "uk" : "en-GB");
  const first = Math.min(...seasons.map((s) => s.year));
  const photos = credits.length;
  const authors = new Set(credits.map((c) => c.author)).size;
  const layouts = layoutCounts();
  const lic = licenseCounts(credits);
  const max = Math.max(...lic.map((l) => l.n));
  const vars = { first, photos: nf.format(photos), f1c: layouts.f1c, commons: layouts.commons };
  const licName = (l: string) => (l === "" ? t.photos.other : l === "Public domain" ? t.photos.pd : l);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t.title,
    url: new URL(path("/sources"), siteUrl()).href,
    inLanguage: lang,
  };

  return (
    <div className="sv-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ServiceHero
        stamp={t.stamp}
        h1={t.h1}
        lead={t.lead}
        facts={[
          { n: nf.format(photos), label: t.facts.photos },
          { n: nf.format(authors), label: t.facts.authors },
          { n: nf.format(layouts.total), label: t.facts.layouts },
          { n: String(first), label: t.facts.first },
          { n: "0", label: t.facts.logos },
        ]}
      />
      <ServiceBody
        idxLabel={t.idx}
        idx={[
          { id: "reg", label: t.reg.h },
          { id: "photos", label: t.photos.h },
          { id: "authors", label: t.authors.h },
          { id: "marks", label: t.marks.h },
        ]}
      >
        <ServiceSection id="reg" title={t.reg.h}>
          <div className="sv-reg" role="region" aria-labelledby="reg-h" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.reg.cols.src}</th>
                  <th scope="col">{t.reg.cols.what}</th>
                  <th scope="col">{t.reg.cols.lic}</th>
                  <th scope="col">{t.reg.cols.means}</th>
                </tr>
              </thead>
              <tbody>
                {t.reg.rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {r.href ? (
                        <a href={r.href.startsWith("/") ? path(r.href) : r.href} rel={r.href.startsWith("/") ? undefined : "noopener"} translate="no">
                          {r.name}
                        </a>
                      ) : (
                        <span translate="no">{r.name}</span>
                      )}
                      {r.sub && <small>{fill(r.sub, vars)}</small>}
                    </th>
                    <td>{fill(r.what, vars)}</td>
                    <td>
                      <span className="sv-lic">{r.lic}</span>
                    </td>
                    <td>{r.means}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ServiceSection>

        <ServiceSection id="photos" title={t.photos.h}>
          <p className="sv-soft">{fill(t.photos.p, vars)}</p>
          {/* Один ряд даних — без легенди (назва ряду в заголовку); підпис і число біля кожного стовпчика (dataviz). */}
          <dl className="sv-bars" aria-label={t.photos.chartLabel}>
            {lic.map((l) => (
              <div key={l.license || "other"} className="sv-bar">
                <dt>{licName(l.license)}</dt>
                <dd>
                  <i style={{ "--w": `${(l.n / max) * 100}%` } as CSSProperties} aria-hidden="true" />
                  <span className="num">{nf.format(l.n)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </ServiceSection>

        <ServiceSection id="authors" title={t.authors.h}>
          <p className="sv-soft">{fill(t.authors.p, vars)}</p>
          <CreditsSearch listId="sv-credits" emptyId="sv-credits-empty" total={photos} t={t.authors} />
          <ul className="sv-credits" id="sv-credits" role="list">
            {credits.map((c) => (
              <li key={c.href} data-k={normKey(`${t.authors.kinds[c.kind]} ${c.label} ${c.author} ${c.license}`)}>
                <span className="sv-kind">{t.authors.kinds[c.kind]}</span>{" "}
                <a href={c.href} rel="noopener">
                  {c.label}
                </a>{" "}
                <span className="sv-by">
                  — <span translate="no">{c.author}</span>, {c.license}
                </span>
              </li>
            ))}
          </ul>
          <p className="sv-soft" id="sv-credits-empty" hidden>
            {t.authors.empty}
          </p>
        </ServiceSection>

        <ServiceSection id="marks" title={t.marks.h}>
          <p>{t.marks.p}</p>
          <p className="sv-soft">{withLink(t.marks.contact, all.about.title, path("/about#contact"))}</p>
        </ServiceSection>
      </ServiceBody>
    </div>
  );
}
