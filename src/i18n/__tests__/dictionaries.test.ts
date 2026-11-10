import { describe, expect, it } from "vitest";
import en from "../dictionaries/en.json";
import uk from "../dictionaries/uk.json";
import { getDictionary } from "../get-dictionary";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort();
}

describe("словники", () => {
  it("UK і EN мають однаковий набір ключів", () => {
    expect(keyPaths(uk)).toEqual(keyPaths(en));
  });

  it("жодного порожнього рядка", () => {
    for (const dict of [en, uk]) {
      const empty = keyPaths(dict).filter((path) => {
        const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict);
        return typeof v !== "string" || v.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });

  it("getDictionary повертає словник потрібної мови", async () => {
    expect(await getDictionary("uk")).toEqual(uk);
    expect(await getDictionary("en")).toEqual(en);
  });
});
