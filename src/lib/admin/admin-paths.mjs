/**
 * Які файли адмінка може змінювати і коли PR адмінки зливається сам (рішення користувача 15.11: автозлиття лише
 * контенту). Одне джерело для сайту (src/lib/admin/paths.ts) і для workflow автозлиття
 * (.github/workflows/admin-merge.yml → scripts/admin/merge-gate.mjs) — тому чистий JS без залежностей.
 *
 * Зображення — лише webp (адмінка нарізає їх сама): SVG з тієї ж адреси, що й сайт, — можливий XSS
 * (security review 15.11), тому схеми трас (svg) — лише ручними PR.
 */
export const ADMIN_PATH_RE =
  /^(content\/stories\/[a-z0-9-]+\/(story\.json|uk\.md|en\.md)|src\/data\/curated\/[a-z0-9-]+\.json|public\/img\/[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9._-]+\.webp)$/;

/** @param {string} path */
export function isAdminPath(path) {
  return ADMIN_PATH_RE.test(path) && !path.split("/").some((s) => s === "." || s === ".." || s.startsWith("."));
}

/** Статуси файлів REST API (pulls/{n}/files), які допускаємо: перейменування — лише коли обидва шляхи — контент. */
const ALLOWED_STATUS = new Set(["added", "modified", "removed", "renamed"]);
const OK_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

/**
 * Чи можна злити PR адмінки без людини. Усі умови — з даних GitHub, не з коду PR.
 * @param {{ pr: { headRefName: string, baseRefName: string, headRefOid: string, isDraft: boolean,
 *   isCrossRepository: boolean, state: string, labels: { name: string }[] },
 *   files: { filename: string, previous_filename?: string, status: string }[],
 *   checks: { total_count: number, check_runs: { name: string, status: string, conclusion: string | null }[] },
 *   status: { statuses: { context: string, state: string }[] }, testedSha: string }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function mergeDecision({ pr, files, checks, status, testedSha }) {
  if (pr.state !== "OPEN") return { ok: false, reason: "PR не відкритий" };
  if (pr.baseRefName !== "main") return { ok: false, reason: "PR не в main" };
  if (!pr.headRefName.startsWith("admin/")) return { ok: false, reason: "гілка не admin/*" };
  if (pr.isCrossRepository) return { ok: false, reason: "PR з форку" };
  if (pr.isDraft) return { ok: false, reason: "чернетка" };
  if (!pr.labels.some((l) => l.name === "admin")) return { ok: false, reason: "немає мітки admin" };
  if (pr.headRefOid !== testedSha) return { ok: false, reason: "після перевірки в PR з'явились нові коміти" };
  if (files.length === 0) return { ok: false, reason: "немає змінених файлів" };
  // Одна сторінка REST — до 100 файлів; більше — не ризикуємо (людина подивиться).
  if (files.length >= 100) return { ok: false, reason: "забагато файлів для автоматичної перевірки" };
  const bad = [];
  for (const f of files) {
    if (!ALLOWED_STATUS.has(f.status)) bad.push(`${f.filename} (${f.status})`);
    for (const p of [f.filename, f.previous_filename]) if (p !== undefined && !isAdminPath(p)) bad.push(p);
  }
  if (bad.length) return { ok: false, reason: `файли поза контентом: ${bad.join(", ")}` };
  // Усі перевірки коміту: check runs (CI, Lighthouse, DB) і статуси (Vercel). Пропущені (skipped/neutral) — не помилка.
  if (!checks || checks.total_count > checks.check_runs.length) return { ok: false, reason: "не всі перевірки видно" };
  if (checks.check_runs.length === 0) return { ok: false, reason: "перевірок немає" };
  const waiting = checks.check_runs.filter((c) => c.status !== "completed").map((c) => c.name);
  if (waiting.length) return { ok: false, reason: `ще йдуть перевірки: ${waiting.join(", ")}` };
  const failed = checks.check_runs.filter((c) => !OK_CONCLUSIONS.has(c.conclusion ?? "")).map((c) => c.name);
  const badStatus = (status?.statuses ?? []).filter((s) => s.state !== "success").map((s) => `${s.context} (${s.state})`);
  if (failed.length || badStatus.length) return { ok: false, reason: `перевірки не зелені: ${[...failed, ...badStatus].join(", ")}` };
  return { ok: true, reason: "лише контент, усі перевірки зелені" };
}
