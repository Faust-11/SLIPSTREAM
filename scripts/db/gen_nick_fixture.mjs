#!/usr/bin/env node
/**
 * Генерує scripts/db/fixtures/nick_parity.json з єдиного JS-джерела правил (src/lib/play/nick-rules.mjs): для кожного зразка —
 * чи придатний нік після NFKC (valid) і його скелет. Далі ту саму фікстуру перевіряють vitest (JS не розійшовся з нею) і
 * scripts/db/test_play.py (SQL play.nick_valid / play.nick_skeleton дають ті самі відповіді) — паритет JS↔SQL.
 *
 *   node scripts/db/gen_nick_fixture.mjs
 */
import { writeFileSync } from "node:fs";
import { nickProblem, nickSkeleton } from "../../src/lib/play/nick-rules.mjs";

const S = [
  // придатні
  "Max", "max", "MAX", "Max Verstappen", "Max_V", "Max.V", "Max-V", "Pilot42", "Ukrainian_Fan-1", "a1b",
  "Борис", "борис", "БОРИС", "Ґанна", "Їжак", "Ёлка", "Київ", "Лев Толстой", "Лев_Толстой",
  "Аdmin", "Admin", "аdmin", "ADMIN", "Ad_min", "Ad min", "Рavel", "Pavel", "Сергій", "Cергій",
  "Ｍａｘ１", "Max Zed", "ﬁsher",
  // непридатні: довжина
  "ab", "", "a", "a".repeat(25), "Б".repeat(25),
  // невидимі / форматування / напрям тексту
  "Max​", "​Max", "Ma­x", "Ma‮x", "Ma‎x", "Ma⁠x", "﻿Max", "Ma‍x", "Max　Z", "Max Z",
  // комбівні, emoji, інше письмо, діакритика, символи
  "Maéx", "Räikkönen", "Max😀", "😀😀😀", "Μαξ", "Max♥", "Max!", "Max#1", "me@mail.test", "Max/V", "Max'V", "Max+V", "Max&V", "Max,V",
  "日本語名前", "Ma҃x",
  // роздільники на краях, подвійні, лише роздільники
  " Max", "Max ", "Max  V", "_Max", "Max_", ".Max", "Max-", "---", "___", "a--",
  // зарезервоване
  "Гравець 1A2B", "гравець x", "Гpавець", "Гравецьx", "ГРАВЕЦЬ",
];
const rows = S.map((input) => {
  const n = input.normalize("NFKC");
  return { input, valid: nickProblem(n) === null, problem: nickProblem(n), skeleton: nickSkeleton(n) };
});
writeFileSync(new URL("./fixtures/nick_parity.json", import.meta.url), JSON.stringify(rows, null, 1) + "\n");
console.log(`${rows.length} зразків; придатних ${rows.filter((r) => r.valid).length}`);
