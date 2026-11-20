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
  // двійники латиниці поза U+0400–U+045F та Ґ/ґ: Ӏ (U+04C0), ӏ (U+04CF), ѡ, ҁ, Ҋ — не дозволені
  "Ben\u04c0", "Ben\u04cf", "Ben\u0460", "Ben\u0481", "Ben\u048a", "\u04c0ban",
  // I / l / 1 / і та O / 0 / о: один скелет («Alex1», «AIex», «Аlех» тощо)
  "Ben1", "Benl", "BenI", "Beni", "Ben\u0456", "Ben\u0406", "Alex1", "Alexl", "AIex", "\u0410l\u0435\u0445", "Alexi",
  "Oleg", "0leg", "\u041eleg", "\u043eleg", "B0ris", "Boris", "\u0411\u043eris", "Bor1s", "Borls",
  // змішані скрипти (латиниця + кирилиця) — відмова
  "\u0410dmin", "Max\u0417", "\u041cax", "Ben\u0406", "\u0420avel", "C\u0435rgiy",
  // кириличні двійники цифр і літер: з/3, б/6, ч/4, г/r, п/n — повноскриптові кириличні ніки з тим самим скелетом
  "Max3", "\u043c\u0430\u0445\u0437", "\u041c\u0430\u0445\u0417", "\u041c\u0430\u04453", "Max6", "\u041c\u0430\u04456", "\u041c\u0430\u0445\u0431", "Max4", "\u041c\u0430\u04454", "\u041c\u0430\u0445\u0447",
  "Pxa", "\u0420\u0445\u0430", "Nah", "\u041f\u0430\u043d", "Rex", "\u0413\u0435\u0445",
  // зарезервоване
  "Гравець 1A2B", "гравець x", "Гpавець", "Гравецьx", "ГРАВЕЦЬ",
];
const rows = S.map((input) => {
  const n = input.normalize("NFKC");
  return { input, valid: nickProblem(n) === null, problem: nickProblem(n), skeleton: nickSkeleton(n) };
});
writeFileSync(new URL("./fixtures/nick_parity.json", import.meta.url), JSON.stringify(rows, null, 1) + "\n");
console.log(`${rows.length} зразків; придатних ${rows.filter((r) => r.valid).length}`);
