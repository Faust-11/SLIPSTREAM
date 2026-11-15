/**
 * Ліцензії фото (рішення користувача 15.11, план 7b): вільні — так; NC («лише некомерційно») — так, з попередженням і
 * у списку; ND («без змін» — ми кадруємо) і невільні — ні. Перелік вільних — той самий, що в scripts/curated
 * (driver_portraits.py FREE / is_free), щоб адмінка й скрипти вирішували однаково.
 */
const FREE = ["CC0", "Public domain", "PD", "CC BY", "CC BY-SA", "Attribution", "OGL", "GFDL", "FAL", "Copyrighted free use"];

export type LicenseVerdict = { level: "ok" | "nc" | "no"; reason: string };

export function classifyLicense(license: string, nonFree = false): LicenseVerdict {
  const norm = license.replace(/-/g, " ").toLowerCase().trim();
  const tokens = norm.split(/\s+/);
  if (!norm) return { level: "no", reason: "ліцензію не вказано" };
  if (nonFree || /fair use|non[- ]?free/.test(norm)) return { level: "no", reason: "невільне (fair use)" };
  if (tokens.includes("nd")) return { level: "no", reason: "ND — без змін (а ми кадруємо)" };
  const free = FREE.some((f) => norm.startsWith(f.replace(/-/g, " ").toLowerCase()));
  if (!free) return { level: "no", reason: `невідома ліцензія «${license}»` };
  if (tokens.includes("nc")) return { level: "nc", reason: "лише некомерційно — знімати, якщо з'явиться реклама, підписка чи спонсор" };
  return { level: "ok", reason: "дозволено" };
}
