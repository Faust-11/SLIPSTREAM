import { describe, expect, it } from "vitest";
import { formatReport, glossaryReport } from "../report";

describe("звіт словника по історіях", () => {
  it("рядки є для обох мов кожної історії, а знахідки — лише зі словника", () => {
    const rows = glossaryReport();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length % 2).toBe(0);
    for (const r of rows) for (const f of r.found) expect(f.known, `${r.slug}/${r.locale}: ${f.id}`).toBe(true);
  });

  it("фільтр за адресою історії й формат тексту", () => {
    const [first] = glossaryReport();
    const only = glossaryReport(first!.slug);
    expect(only.every((r) => r.slug === first!.slug)).toBe(true);
    expect(formatReport(only)).toContain(`${first!.slug} [uk]`);
    expect(glossaryReport("no-such-story")).toEqual([]);
  });

  // Друк звіту — лише за запитом: GLOSSARY_REPORT=1 (npm run glossary:report). Параметр — адреса історії в GLOSSARY_ONLY.
  it.runIf(process.env.GLOSSARY_REPORT === "1")("друк звіту", () => {
    process.stdout.write(`\n${formatReport(glossaryReport(process.env.GLOSSARY_ONLY || undefined))}\n`);
  });
});
