// Відповіді бази для unit-тестів — та сама фікстура, що для e2e (e2e/fixtures/db, вивантажена з CI-бази).
import siteMeta from "../../../../e2e/fixtures/db/site_meta.json";
import teamIndex from "../../../../e2e/fixtures/db/team_index.json";

const FIXTURES: Record<string, unknown[]> = { team_index: teamIndex, site_meta: siteMeta, drivers: [] };

export async function dbSelect<T>(view: string): Promise<T[]> {
  const rows = FIXTURES[view];
  if (!rows) throw new Error(`немає фікстури для ${view}`);
  return rows as T[];
}
