/**
 * Які файли адмінка може змінювати і коли PR адмінки зливається сам (рішення користувача 15.11: автозлиття лише
 * контенту). Одне джерело для сайту (src/lib/admin/paths.ts) і для workflow автозлиття
 * (.github/workflows/admin-merge.yml → scripts/admin/merge-gate.mjs) — тому чистий JS без залежностей.
 */
export const ADMIN_PATH_RE =
  /^(content\/stories\/[a-z0-9-]+\/[a-z0-9.-]+|src\/data\/curated\/[a-z0-9-]+\.json|public\/img\/[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9._-]+\.(webp|jpg|png|svg))$/;

/** @param {string} path */
export function isAdminPath(path) {
  return ADMIN_PATH_RE.test(path) && !path.split("/").some((s) => s === "." || s === ".." || s.startsWith("."));
}

/**
 * Чи можна злити PR адмінки без людини. Усі умови — з даних GitHub, не з коду PR.
 * @param {{ pr: { headRefName: string, headRefOid: string, isDraft: boolean, isCrossRepository: boolean,
 *   state: string, labels: { name: string }[], files: { path: string }[] }, testedSha: string }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function mergeDecision({ pr, testedSha }) {
  if (pr.state !== "OPEN") return { ok: false, reason: "PR не відкритий" };
  if (!pr.headRefName.startsWith("admin/")) return { ok: false, reason: "гілка не admin/*" };
  if (pr.isCrossRepository) return { ok: false, reason: "PR з форку" };
  if (pr.isDraft) return { ok: false, reason: "чернетка" };
  if (!pr.labels.some((l) => l.name === "admin")) return { ok: false, reason: "немає мітки admin" };
  if (pr.headRefOid !== testedSha) return { ok: false, reason: "після перевірки в PR з'явились нові коміти" };
  if (pr.files.length === 0) return { ok: false, reason: "немає змінених файлів" };
  // gh pr view --json files віддає до 100 файлів; більше — не ризикуємо (людина подивиться).
  if (pr.files.length >= 100) return { ok: false, reason: "забагато файлів для автоматичної перевірки" };
  const bad = pr.files.map((f) => f.path).filter((p) => !isAdminPath(p));
  if (bad.length) return { ok: false, reason: `файли поза контентом: ${bad.join(", ")}` };
  return { ok: true, reason: "лише контент, CI зелений" };
}
