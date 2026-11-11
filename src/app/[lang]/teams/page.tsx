import type { Metadata } from "next";
import { PageCredits } from "@/components/teams/page-credits";
import { TeamsBrowser } from "@/components/teams/teams-browser";
import { TeamsIntro } from "@/components/teams/teams-intro";
import { getDictionary } from "@/i18n/get-dictionary";
import { requireLocale } from "@/i18n/require-locale";
import { getTeamsCredits, getTeamsIndex, getTeamsSeason, TEAMS_PAGE_SIZE } from "@/lib/data/teams";
import { plural } from "@/lib/plural";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return pageMetadata({ locale: lang, path: "/teams", title: dict.nav.teams, description: dict.meta.sections.teams });
}

export default async function TeamsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.teams;
  const cards = await getTeamsIndex(lang);
  const season = getTeamsSeason();
  const credits = await getTeamsCredits();
  const count = (n: number, forms: typeof t.facts.constructors) => ({ value: n, label: plural(n, lang, forms) });

  return (
    <>
      <TeamsIntro
        title={dict.nav.teams}
        factsLabel={t.factsLabel}
        facts={[
          count(cards.length, t.facts.constructors),
          count(cards.filter((c) => c.titles > 0).length, t.facts.champions),
          count(cards.filter((c) => c.wins > 0).length, t.facts.winners),
        ]}
      />
      <TeamsBrowser
        cards={cards}
        locale={lang}
        season={season}
        pageSize={TEAMS_PAGE_SIZE}
        labels={{
          card: { stats: t.stats, seasons: t.seasons, position: t.position, positionLabel: t.positionLabel, drivers: t.drivers },
          search: t.search,
          searchPlaceholder: t.searchPlaceholder,
          filtersLabel: t.filtersLabel,
          filters: t.filters,
          sortLabel: t.sortLabel,
          sorts: t.sorts,
          empty: t.empty,
          emptyQuery: t.emptyQuery,
          reset: t.reset,
          more: t.more,
          found: t.found,
        }}
      />
      <PageCredits
        groups={[
          {
            title: t.credits.cars,
            items: credits.cars.map((c) => ({ label: c.team, href: c.page, author: c.author, license: c.license })),
          },
          {
            title: t.credits.drivers,
            items: credits.avatars.map((c) => ({ label: c.driver, href: c.page, author: c.author, license: c.license })),
          },
        ]}
      />
    </>
  );
}
