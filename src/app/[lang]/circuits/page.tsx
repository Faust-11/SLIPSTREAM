import type { Metadata } from "next";
import { CircuitsBrowser } from "@/components/circuits/circuits-browser";
import { PageCredits } from "@/components/teams/page-credits";
import { TeamsIntro } from "@/components/teams/teams-intro";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { CIRCUITS_PAGE_SIZE, getCircuitsIndex } from "@/lib/data/circuits";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbList } from "@/lib/jsonld";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const data = await getCircuitsIndex(lang);
  return pageMetadata({ locale: lang, path: "/circuits", title: dict.nav.circuits, description: fill(dict.circuitsPage.metaDescription, { n: data.facts.circuits }) });
}

export default async function CircuitsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.circuitsPage;
  const data = await getCircuitsIndex(lang);
  const { season } = data.facts;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: dict.nav.circuits,
    url: new URL(localizedPath("/circuits", lang), siteUrl()).href,
    numberOfItems: data.cards.length,
    itemListElement: data.cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: new URL(localizedPath(`/circuits/${c.slug}`, lang), siteUrl()).href,
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: dict.nav.circuits, path: "/circuits" }])} />
      <TeamsIntro
        title={dict.nav.circuits}
        factsLabel={t.factsLabel}
        facts={[
          { value: data.facts.circuits, label: plural(data.facts.circuits, lang, t.facts.circuits) },
          { value: data.facts.countries, label: plural(data.facts.countries, lang, t.facts.countries) },
          { value: data.facts.onCalendar, label: fill(t.facts.onCalendar, { season }) },
        ]}
      />
      <CircuitsBrowser
        cards={data.cards}
        locale={lang}
        season={season}
        fromYear={data.fromYear}
        pageSize={CIRCUITS_PAGE_SIZE}
        labels={{
          card: {
            races: t.races,
            mostWins: t.mostWins,
            noRaces: t.noRaces,
            noLayout: t.noLayout,
            layoutLabel: t.layoutLabel,
            yearsLabel: t.yearsLabel,
            calendarBadge: t.calendarBadge,
            tieDrivers: t.tieDrivers,
          },
          tools: t.tools,
          search: t.search,
          searchPlaceholder: t.searchPlaceholder,
          filtersLabel: t.filtersLabel,
          filters: t.filters,
          sort: t.sort,
          sorts: t.sorts,
          count: t.count,
          empty: t.empty,
          reset: t.reset,
          more: t.more,
        }}
      />
      <PageCredits
        groups={[
          // Джерело схем (MIT, ODbL — атрибуція обов'язкова) — у блоці авторів під підвалом, а не підписом над ним
          // (відгук користувача 15.11).
          {
            title: t.credits,
            items: [
              { label: "f1-circuits", href: "https://github.com/bacinger/f1-circuits", author: "Tomislav Bacinger", license: "MIT" },
              { label: "OpenStreetMap", href: "https://www.openstreetmap.org/copyright", author: t.osmAuthor, license: "ODbL" },
              ...data.credits.layouts,
            ],
          },
          { title: dict.teams.credits.drivers, items: data.credits.portraits },
        ]}
      />
    </>
  );
}
