#!/usr/bin/env node
/**
 * Крок workflow автозлиття (.github/workflows/admin-merge.yml):
 *   node scripts/admin/merge-gate.mjs <sha> <pr.json: gh pr view --json …> <files.json: REST pulls/{n}/files>
 *     <checks.json: REST commits/{sha}/check-runs> <status.json: REST commits/{sha}/status>
 * Друкує причину; код виходу 0 — зливати, 1 — ні. Логіка — src/lib/admin/admin-paths.mjs.
 */
import { readFileSync } from "node:fs";
import { mergeDecision } from "../../src/lib/admin/admin-paths.mjs";

const [testedSha = "", prFile, filesFile, checksFile, statusFile] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(f ?? "/dev/null", "utf8"));
let decision;
try {
  decision = mergeDecision({ pr: read(prFile), files: read(filesFile), checks: read(checksFile), status: read(statusFile), testedSha });
} catch (e) {
  decision = { ok: false, reason: `не вдалося прочитати дані PR: ${e.message}` };
}
console.log(decision.reason);
process.exit(decision.ok ? 0 : 1);
