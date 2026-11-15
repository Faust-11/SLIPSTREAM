#!/usr/bin/env node
/**
 * Крок workflow автозлиття (.github/workflows/admin-merge.yml): stdin — JSON `gh pr view --json …`, аргумент — sha,
 * який перевірив CI. Друкує причину; код виходу 0 — зливати, 1 — ні. Логіка — src/lib/admin/admin-paths.mjs.
 */
import { mergeDecision } from "../../src/lib/admin/admin-paths.mjs";

const testedSha = process.argv[2] ?? "";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { ok, reason } = mergeDecision({ pr: JSON.parse(input), testedSha });
console.log(reason);
process.exit(ok ? 0 : 1);
