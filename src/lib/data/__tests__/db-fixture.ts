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

/** Як PostgREST: лише колонки з select= (забута колонка — undefined і в тестах), невідома колонка — помилка. */
export async function dbSelect<T>(view: string, query = ""): Promise<T[]> {
  const rows = FIXTURES[view] as Record<string, unknown>[] | undefined;
  if (!rows) throw new Error(`немає фікстури для ${view}`);
  const select = new URLSearchParams(query).get("select");
  if (!select || select === "*" || rows.length === 0) return rows as T[];
  const cols = select.split(",");
  const missing = cols.filter((c) => !(c in rows[0]!));
  if (missing.length) throw new Error(`База: ${view} → 400 column ${missing[0]} does not exist`);
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) as T[];
}

export const dbSelectAll = dbSelect;
