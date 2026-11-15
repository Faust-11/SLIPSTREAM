#!/usr/bin/env node
/**
 * Які сторінки міряти Lighthouse у PR — лише ті, що змінює PR (рішення користувача 15.11: «Lighthouse тільки по
 * змінених сторінках»; повний прогін 15 сторінок × 3 — ~20 хв).
 *
 *   git diff --name-only origin/main...HEAD | node scripts/lighthouse-pages.mjs
 *
 * Друкує: «ALL» — спільні файли (оболонка сайту, глобальні стилі, словники, спільні дані, залежності) → усі сторінки;
 * інакше — сторінки змінених розділів через пробіл; порожній рядок — нічого міряти (лише тести, документація, скрипти).
 * Невідомий шлях у src/ чи public/ — «ALL» (безпечніше переміряти зайве, ніж пропустити регрес).
 */
import { readFileSync } from "node:fs";

// Розділ → сторінки зі scripts/lighthouse.mjs (по одній кожного шаблону).
export const SECTION_PAGES = {
  home: ["/"],
  teams: ["/uk/teams", "/teams/ferrari"],
  team: ["/teams/ferrari"],
  drivers: ["/uk/drivers", "/uk/drivers/hamilton"],
  driver: ["/uk/drivers/hamilton"],
  seasons: ["/uk/seasons"],
  season: ["/uk/seasons/2025"],
  race: ["/uk/seasons/2025/24"],
  circuits: ["/uk/circuits", "/circuits/yas-marina"],
  calendar: ["/uk/calendar"],
  news: ["/uk/news"],
  game: ["/uk/game"],
  stories: ["/uk/stories", "/uk/stories/singapore-2008"],
};

// Шари даних (src/lib/data/<файл>.ts) → розділи, що їх читають.
const DATA_FILES = {
  teams: ["teams"],
  "team-page": ["team"],
  drivers: ["drivers", "driver"],
  "driver-page": ["driver"],
  seasons: ["seasons"],
  "season-page": ["season", "race", "calendar", "stories"],
  "race-page": ["race"],
  circuits: ["circuits"],
  calendar: ["calendar"],
};

// Не впливають на сторінки: тести, документація, скрипти підготовки даних (дані потрапляють у src/data — там ALL).
const IGNORE = [/^e2e\//, /\/__tests__\//, /\.test\.tsx?$/, /^docs\//, /\.md$/, /^scripts\/(curated|db|jolpica|content|snapshot)\//, /^scripts\/lighthouse/, /^\.github\//, /^supabase\//];

/** @param {string[]} files @returns {"ALL" | string[]} */
export function pagesFor(files) {
  const sections = new Set();
  for (const f of files.map((x) => x.trim()).filter(Boolean)) {
    if (IGNORE.some((re) => re.test(f))) continue;
    let m;
    if (f === "src/app/[lang]/page.tsx") sections.add("home");
    else if ((m = /^src\/app\/\[lang\]\/(\w+)\/(.*)$/.exec(f))) {
      const [, seg, rest] = m;
      if (seg === "seasons") sections.add(rest.startsWith("[year]/[round]") ? "race" : rest.startsWith("[year]") ? "season" : "seasons");
      else if (seg === "teams") sections.add(rest.startsWith("[id]") ? "team" : "teams");
      else if (seg === "drivers") sections.add(rest.startsWith("[id]") ? "driver" : "drivers");
      else if (SECTION_PAGES[seg]) sections.add(seg);
      else return "ALL";
    } else if ((m = /^src\/components\/(\w+)\//.exec(f)) && SECTION_PAGES[m[1]]) sections.add(m[1]);
    else if (/^(content\/stories|public\/img\/stories|src\/lib\/stories)\//.test(f)) sections.add("stories");
    else if (/^src\/(lib|components)\/game\//.test(f)) sections.add("game");
    else if (/^src\/lib\/news\//.test(f)) sections.add("news");
    else if ((m = /^src\/lib\/data\/([\w-]+)\.ts$/.exec(f)) && DATA_FILES[m[1]]) DATA_FILES[m[1]].forEach((s) => sections.add(s));
    else if ((m = /^public\/img\/(drivers|teams|seasons|circuits)\//.exec(f))) {
      ({ drivers: ["drivers", "driver", "seasons", "season"], teams: ["teams", "team"], seasons: ["seasons", "season"], circuits: ["circuits", "race"] })[m[1]].forEach((s) => sections.add(s));
    } else return "ALL";
  }
  return [...new Set([...sections].flatMap((s) => SECTION_PAGES[s]))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = pagesFor(readFileSync(0, "utf8").split("\n"));
  console.log(result === "ALL" ? "ALL" : result.join(" "));
}
