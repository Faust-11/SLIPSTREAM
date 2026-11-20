import "server-only";
import { ADMIN_LABEL, type GitHub } from "../github";

/**
 * Версії історії (7c, задача 6): журнал злитих PR адмінки, що чіпали саме цю історію, і diff правки.
 * Власного diff-рушія немає: GitHub віддає `patch` кожного файлу PR (unified diff) — ми лише розбираємо його на рядки.
 *
 * Чия це правка, визначаємо за гілкою: редактор і фото — `admin/stories-<slug>-<час>`; відкат — `admin/revert-<час>` із
 * назвою «Відкат: Історія · <slug>: …» (перша частина назви PR історії завжди «Історія · <slug>:», див. actions.ts).
 */
export type VersionKind = "edit" | "revert";
export type Version = { number: number; title: string; url: string; mergedAt: string; kind: VersionKind };

type GhPull = {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  draft?: boolean;
  labels: { name: string }[];
  head: { ref: string };
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Чи PR належить історії; `edit` — правка редактора чи фото, `revert` — відкат такої правки. */
export function prKind(slug: string, pr: { head: { ref: string }; title: string }): VersionKind | null {
  if (new RegExp(`^admin/stories-${escape(slug)}-\\d{8}-\\d{6}$`).test(pr.head.ref)) return "edit";
  if (/^admin\/revert-\d{8}-\d{6}$/.test(pr.head.ref) && pr.title.startsWith(`Відкат: Історія · ${slug}:`)) return "revert";
  return null;
}

const PAGE = 100;
const MAX_PAGES = 5;
export const MAX_VERSIONS = 30;

/** Злиті PR адмінки цієї історії, новіші першими. Дивимось до 500 останніх закритих PR репозиторію (на 19.11 їх ≈ 60). */
export async function listVersions(gh: GitHub, slug: string): Promise<Version[]> {
  const out: Version[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const prs = await gh.request<GhPull[]>("GET", `/pulls?state=closed&sort=updated&direction=desc&per_page=${PAGE}&page=${page}`);
    for (const p of prs) {
      const kind = prKind(slug, p);
      if (kind && p.merged_at && p.labels.some((l) => l.name === ADMIN_LABEL)) {
        out.push({ number: p.number, title: p.title, url: p.html_url, mergedAt: p.merged_at, kind });
      }
    }
    if (prs.length < PAGE) break;
  }
  return out.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)).slice(0, MAX_VERSIONS);
}

export type DiffLine = { kind: "add" | "del" | "ctx" | "hunk"; text: string };

/** Unified diff від GitHub → рядки з типом. Рядок «\ No newline at end of file» лишається контекстом. */
export function parsePatch(patch: string): DiffLine[] {
  return patch.split("\n").map((raw) => {
    if (raw.startsWith("@@")) return { kind: "hunk", text: raw };
    if (raw.startsWith("+")) return { kind: "add", text: raw.slice(1) };
    if (raw.startsWith("-")) return { kind: "del", text: raw.slice(1) };
    return { kind: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw };
  });
}

export type VersionFile = { filename: string; status: string; additions: number; deletions: number; lines: DiffLine[] | null; story: boolean };

export type VersionDiff = { version: Version; files: VersionFile[]; truncated: boolean };

const isStoryFile = (slug: string, filename: string): boolean => filename.startsWith(`content/stories/${slug}/`);

/** Файли PR з diff. null — PR не з журналу цієї історії (чужий номер у адресі не відкриваємо). */
export async function loadVersion(gh: GitHub, slug: string, number: number): Promise<VersionDiff | null> {
  const pr = await gh.request<GhPull>("GET", `/pulls/${number}`);
  const kind = prKind(slug, pr);
  if (!kind || !pr.merged_at || !pr.labels.some((l) => l.name === ADMIN_LABEL)) return null;
  const files = await gh.request<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>(
    "GET",
    `/pulls/${number}/files?per_page=100`,
  );
  return {
    version: { number: pr.number, title: pr.title, url: pr.html_url, mergedAt: pr.merged_at, kind },
    truncated: files.length >= 100,
    files: files
      .map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        lines: f.patch === undefined ? null : parsePatch(f.patch),
        story: isStoryFile(slug, f.filename),
      }))
      // Файли історії першими (story.json, uk.md, en.md), далі фото.
      .sort((a, b) => Number(b.story) - Number(a.story) || a.filename.localeCompare(b.filename)),
  };
}
