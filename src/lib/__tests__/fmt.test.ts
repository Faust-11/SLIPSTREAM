import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtDay, fmtNumber, fmtRelative, fmtSession, pluralCategory } from "@/lib/fmt";

// Власні формати без Intl (src/lib/fmt.ts) мають давати той самий текст, що й Intl Node — сайт виглядає як раніше.
const tag = { uk: "uk", en: "en-GB" } as const;
const locales = ["uk", "en"] as const;
// Кожен день 2026 року о різній годині (місяці, дні тижня, нулі в годинах/хвилинах).
const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i, (i * 7) % 24, (i * 13) % 60)).toISOString());

describe("fmt — збіг з Intl", () => {
  it.each(locales)("дата й сесія (%s, UTC)", (l) => {
    const day = new Intl.DateTimeFormat(tag[l], { day: "numeric", month: "short", timeZone: "UTC" });
    const wd = new Intl.DateTimeFormat(tag[l], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const tm = new Intl.DateTimeFormat(tag[l], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
    for (const iso of dates) {
      expect(fmtDay(iso, l, true)).toBe(day.format(new Date(iso)));
      expect(fmtSession(iso, l, true)).toBe(`${wd.format(new Date(iso))} · ${tm.format(new Date(iso))}`);
    }
  });

  it.each(locales)("повна дата для підказки (%s)", (l) => {
    for (const iso of dates.slice(0, 40)) {
      const ref = new Date(iso).toLocaleString(tag[l], { timeZone: "UTC" }).replace(/:\d\d$/, "");
      expect(fmtDateTime(iso, l, true)).toBe(ref);
    }
  });

  it.each(locales)("відносний час (%s)", (l) => {
    const rtf = new Intl.RelativeTimeFormat(tag[l], { numeric: "auto", style: "short" });
    const now = Date.UTC(2026, 10, 17, 12);
    const ref = (s: number) => {
      const a = Math.abs(s);
      if (a < 60) return rtf.format(0, "minute");
      if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
      if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
      return rtf.format(Math.round(s / 86400), "day");
    };
    for (const s of [-30, -60, -90, -59 * 60, -3600, -5400, -23 * 3600, -86400, -2 * 86400, -3 * 86400, -6 * 86400, 120, 7200, 86400, 2 * 86400, 5 * 86400]) {
      expect(fmtRelative(new Date(now + s * 1000).toISOString(), now, l)).toBe(ref(s));
    }
  });

  it.each(locales)("числа (%s)", (l) => {
    const nf = new Intl.NumberFormat(l);
    for (const n of [0, 5, 49, 999, 1000, 1234, 12345, 166, 3723.5, 1234567, 0.235, 2.4567, -1500, 0.1 + 0.2]) expect(fmtNumber(n, l)).toBe(nf.format(n));
    const n3 = new Intl.NumberFormat(l, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    for (const n of [0.2, 0.2345, 1.5, 12.25]) expect(fmtNumber(n, l, 3)).toBe(n3.format(n));
  });

  it.each(locales)("множина (%s)", (l) => {
    const pr = new Intl.PluralRules(l);
    for (let n = 0; n <= 1000; n++) expect(pluralCategory(n, l)).toBe(pr.select(n));
    for (const n of [0.5, 1.5, 2.25, 3723.5]) expect(pluralCategory(n, l)).toBe(pr.select(n));
  });
});
