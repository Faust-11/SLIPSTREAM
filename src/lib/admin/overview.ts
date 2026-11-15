import "server-only";
import circuitLayouts from "@/data/curated/circuit-layouts.json";
import curatedTeams from "@/data/curated/teams.json";
import { getCalendarPage, type CalendarCard } from "@/lib/data/calendar";
import { getCircuitRefs } from "@/lib/data/circuits";
import { getDriversIndex, type DriverRow } from "@/lib/data/drivers";
import { getStory, getStorySlugs } from "@/lib/stories/content";
import { ADMIN_LABEL, GitHub, githubEnv } from "./github";

/**
 * Дані «Огляду» адмінки. Чисті функції рішень (що вважати проблемою) — окремо від завантаження, щоб їх перевіряли
 * unit-тести. Джерела: база (через ті самі запити, що й сайт), curated JSON, GitHub API (історія прогонів, статус
 * Vercel на main, PR адмінки).
 */

const HOUR = 3_600_000;
/** Гонка ~2 год + запас; data-sync у гоночні вихідні — щогодини (.github/workflows/data-sync.yml). */
export const RACE_RESULT_GRACE_H = 4;
/** Збірка Vercel ~5 хв; 15 хв без статусу = збірка не почалась (злиття PR #35, 15.11: 502 GitHub загубив push). */
export const DEPLOY_GRACE_MIN = 15;

export type Level = "ok" | "one" | "bad";
export type Attention = { level: Exclude<Level, "ok">; title: string; text: string; href?: string };

/** Перший етап, що мав уже фінішувати, а результату в базі немає. */
export function raceLag(cards: Pick<CalendarCard, "round" | "gp" | "state" | "raceAt">[], now: number): { round: number; gp: string; hours: number } | null {
  for (const c of cards) {
    if (c.state === "done" || !c.raceAt) continue;
    const hours = (now - Date.parse(c.raceAt)) / HOUR;
    return hours >= RACE_RESULT_GRACE_H ? { round: c.round, gp: c.gp, hours: Math.floor(hours) } : null;
  }
  return null;
}

export type DeployState = { level: Level; label: string };

/** Чи викладено main на прод: статус «Vercel» на останньому коміті main. */
export function deployState(status: { state: string } | null, committedAt: string, now: number): DeployState {
  if (status?.state === "success") return { level: "ok", label: "Викладено" };
  if (status?.state === "failure" || status?.state === "error") return { level: "bad", label: "Збірка впала" };
  const minutes = (now - Date.parse(committedAt)) / 60_000;
  if (minutes < DEPLOY_GRACE_MIN) return { level: "one", label: "Збирається" };
  return { level: "bad", label: status ? "Збірка зависла" : "Збірка не почалась" };
}

export type RunInfo = { conclusion: string | null; status: string; at: string; url: string; sha: string } | null;

export function runLevel(run: RunInfo): Level {
  if (!run) return "bad";
  if (run.status !== "completed") return "one";
  return run.conclusion === "success" ? "ok" : "bad";
}

export type Coverage = { label: string; have: number; total: number }[];

export function coverage(
  drivers: Pick<DriverRow, "avatar">[],
  teams: { photo?: unknown }[],
  circuitRefs: string[],
  layouts: Record<string, unknown>,
  stories: { en: boolean }[],
): Coverage {
  return [
    { label: "Портрети пілотів", have: drivers.filter((d) => d.avatar).length, total: drivers.length },
    { label: "Фото болідів команд", have: teams.filter((t) => t.photo).length, total: teams.length },
    { label: "Схеми трас", have: circuitRefs.filter((r) => r in layouts).length, total: circuitRefs.length },
    { label: "Історії з перекладом EN", have: stories.filter((s) => s.en).length, total: stories.length },
  ];
}

/** Без портрета — за важливістю (як черга фото в макеті): чемпіони, переможці, призери. */
export function missingPortraits(drivers: Pick<DriverRow, "name" | "avatar" | "titles" | "wins" | "podiums">[]) {
  const missing = drivers.filter((d) => !d.avatar);
  return {
    champions: missing.filter((d) => d.titles > 0).map((d) => d.name),
    winners: missing.filter((d) => d.titles === 0 && d.wins > 0).length,
    podiums: missing.filter((d) => d.wins === 0 && d.podiums > 0).length,
  };
}

// ---------------------------------------------------------------------------------------------------------------

export type JournalItem = { number: number; title: string; mergedAt: string; url: string };

export type GitHubState = {
  main: { sha: string; at: string; deploy: DeployState };
  dataSync: RunInfo;
  ciMain: RunInfo;
  journal: JournalItem[];
  /** PR адмінки, що чекають: чернетки, CI, ручне злиття (файли поза контентом). */
  open: { number: number; title: string; url: string; draft: boolean }[];
};

type GhRun = { status: string; conclusion: string | null; created_at: string; html_url: string; head_sha: string };
type GhPull = { number: number; title: string; html_url: string; draft: boolean; merged_at: string | null; labels: { name: string }[] };

const toRun = (r: GhRun | undefined): RunInfo => (r ? { status: r.status, conclusion: r.conclusion, at: r.created_at, url: r.html_url, sha: r.head_sha } : null);

export async function loadGitHubState(gh: GitHub, now = Date.now()): Promise<GitHubState> {
  const [commit, status, sync, ci, closed, open] = await Promise.all([
    gh.request<{ sha: string; commit: { committer: { date: string } } }>("GET", "/commits/main"),
    gh.request<{ statuses: { context: string; state: string }[] }>("GET", "/commits/main/status"),
    gh.request<{ workflow_runs: GhRun[] }>("GET", "/actions/workflows/data-sync.yml/runs?per_page=1"),
    // Лише push у main: злиття токеном Actions (автозлиття адмінки) push-прогонів не запускають — тоді коміт main
    // перевірено в PR, а тут видно старіший прогін (сторінка показує це через sha).
    gh.request<{ workflow_runs: GhRun[] }>("GET", "/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=1"),
    gh.request<GhPull[]>("GET", "/pulls?state=closed&sort=updated&direction=desc&per_page=50"),
    gh.request<GhPull[]>("GET", "/pulls?state=open&per_page=50"),
  ]);
  const isAdmin = (p: GhPull) => p.labels.some((l) => l.name === ADMIN_LABEL);
  const vercel = status.statuses.find((s) => s.context === "Vercel") ?? null;
  return {
    main: { sha: commit.sha, at: commit.commit.committer.date, deploy: deployState(vercel, commit.commit.committer.date, now) },
    dataSync: toRun(sync.workflow_runs[0]),
    ciMain: toRun(ci.workflow_runs[0]),
    journal: closed
      .filter((p) => isAdmin(p) && p.merged_at)
      .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!))
      .slice(0, 10)
      .map((p) => ({ number: p.number, title: p.title, mergedAt: p.merged_at!, url: p.html_url })),
    open: open.filter(isAdmin).map((p) => ({ number: p.number, title: p.title, url: p.html_url, draft: p.draft })),
  };
}

export type Overview = {
  now: number;
  site: { season: number; done: number; total: number; lastRace: string | null; lag: ReturnType<typeof raceLag> };
  coverage: Coverage;
  portraits: ReturnType<typeof missingPortraits>;
  github: GitHubState | null;
  githubError: boolean;
  attention: Attention[];
};

export function attentionList(o: Omit<Overview, "attention">): Attention[] {
  const out: Attention[] = [];
  if (!o.github) {
    out.push({
      level: "one",
      title: o.githubError ? "GitHub не відповідає" : "GitHub не підключено",
      text: o.githubError ? "Стан збірок і журнал правок зараз недоступні." : "Без токена GitHub адмінка не бачить збірок і не може публікувати правки.",
      href: "/admin/system",
    });
  } else {
    const d = o.github.main.deploy;
    if (d.level !== "ok") out.push({ level: d.level, title: `Прод: ${d.label.toLowerCase()}`, text: `Останній коміт main ${o.github.main.sha.slice(0, 7)} ще не на сайті.` });
    if (runLevel(o.github.dataSync) === "bad") out.push({ level: "bad", title: "Синхронізація даних не пройшла", text: "Останній прогін data-sync завершився помилкою.", href: o.github.dataSync?.url });
    if (runLevel(o.github.ciMain) === "bad") out.push({ level: "bad", title: "CI на main червоний", text: "Остання перевірка main впала.", href: o.github.ciMain?.url });
  }
  if (o.site.lag) {
    out.push({ level: "bad", title: `Немає результату: етап ${o.site.lag.round}`, text: `${o.site.lag.gp} — ${o.site.lag.hours} год після старту, а в базі результату ще немає.` });
  }
  const p = o.portraits;
  if (p.champions.length) out.push({ level: "one", title: `Чемпіон без портрета: ${p.champions.join(", ")}`, text: `Без портрета також ${p.winners} переможців гонок і ${p.podiums} призерів.` });
  return out;
}

export async function loadOverview(now = Date.now()): Promise<Overview> {
  const env = githubEnv();
  const [calendar, drivers, circuitRefs, github] = await Promise.all([
    getCalendarPage("uk"),
    getDriversIndex("uk"),
    getCircuitRefs(),
    env ? loadGitHubState(new GitHub(env), now).catch(() => "error" as const) : Promise.resolve(null),
  ]);
  const stories = getStorySlugs().map((slug) => ({ en: getStory(slug, "en") !== null }));
  const last = [...calendar.cards].reverse().find((c) => c.state === "done");
  const base: Omit<Overview, "attention"> = {
    now,
    site: { season: calendar.season, done: calendar.done, total: calendar.total, lastRace: last ? last.gp : null, lag: raceLag(calendar.cards, now) },
    coverage: coverage(drivers, curatedTeams.teams, circuitRefs, circuitLayouts.layouts, stories),
    portraits: missingPortraits(drivers),
    github: github === "error" ? null : github,
    githubError: github === "error",
  };
  return { ...base, attention: attentionList(base) };
}
