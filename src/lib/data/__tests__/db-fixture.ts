// Відповіді бази для unit-тестів — та сама фікстура, що для e2e (e2e/fixtures/db, вивантажена з CI-бази).
import siteMeta from "../../../../e2e/fixtures/db/site_meta.json";
import teamChampions from "../../../../e2e/fixtures/db/team_champions.json";
import teamIndex from "../../../../e2e/fixtures/db/team_index.json";
import teamPairing from "../../../../e2e/fixtures/db/team_pairing.json";
import teamSeasons from "../../../../e2e/fixtures/db/team_seasons.json";
import teamTotals from "../../../../e2e/fixtures/db/team_totals.json";
import teamWins from "../../../../e2e/fixtures/db/team_wins.json";

const FIXTURES: Record<string, unknown[]> = {
  team_index: teamIndex,
  site_meta: siteMeta,
  drivers: [],
  team_totals: teamTotals,
  team_seasons: teamSeasons,
  team_wins: teamWins,
  team_champions: teamChampions,
  team_pairing: teamPairing,
};

export async function dbSelect<T>(view: string): Promise<T[]> {
  const rows = FIXTURES[view];
  if (!rows) throw new Error(`немає фікстури для ${view}`);
  return rows as T[];
}

export const dbSelectAll = dbSelect;
