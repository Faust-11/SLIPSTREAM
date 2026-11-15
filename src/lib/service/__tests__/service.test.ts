import { describe, expect, it } from "vitest";
import { cleanAuthor, isUnknownAuthor, layoutCounts, licenseCounts, licenseFamily } from "@/lib/data/credits";
import { contactEmail, serviceText } from "../content";
import { normKey } from "../norm";

const shape = (x: unknown): string[] =>
  Array.isArray(x)
    ? [`[${x.length}]`, ...x.flatMap((v, i) => shape(v).map((s) => `${i}.${s}`))]
    : x && typeof x === "object"
      ? Object.keys(x).sort().flatMap((k) => [k, ...shape((x as Record<string, unknown>)[k]).map((s) => `${k}.${s}`)])
      : [typeof x];

describe("службові сторінки", () => {
  it("uk і en — однакова структура текстів", () => {
    expect(shape(serviceText("en"))).toEqual(shape(serviceText("uk")));
  });

  it("сімейство ліцензії: національні версії CC — до загальної; решта як є", () => {
    expect(licenseFamily("CC BY-SA 3.0 nl")).toBe("CC BY-SA 3.0");
    expect(licenseFamily("CC BY 2.0 de")).toBe("CC BY 2.0");
    expect(licenseFamily("Public domain")).toBe("Public domain");
  });

  it("графік ліцензій: рідкісні — в «Інші» (порожня назва), сума не губиться", () => {
    const items = [...Array(20).fill({ license: "CC0" }), ...Array(3).fill({ license: "FAL" }), ...Array(2).fill({ license: "OGL 3" })];
    expect(licenseCounts(items)).toEqual([
      { license: "CC0", n: 20 },
      { license: "", n: 5 },
    ]);
  });

  it("схеми трас: f1-circuits + commons = усі", () => {
    const c = layoutCounts();
    expect(c.f1c + c.commons).toBe(c.total);
    expect(c.f1c).toBeGreaterThan(0);
  });

  it("контакт — лише коректна адреса з SITE_CONTACT_EMAIL; без змінної — null (не вигадана адреса)", () => {
    const prev = process.env.SITE_CONTACT_EMAIL;
    delete process.env.SITE_CONTACT_EMAIL;
    expect(contactEmail()).toBeNull();
    process.env.SITE_CONTACT_EMAIL = "hello@example.org";
    expect(contactEmail()).toBe("hello@example.org");
    process.env.SITE_CONTACT_EMAIL = "<script>@x";
    expect(contactEmail()).toBeNull();
    if (prev === undefined) delete process.env.SITE_CONTACT_EMAIL;
    else process.env.SITE_CONTACT_EMAIL = prev;
  });

  it("ключ пошуку — без регістру; діакритика знімається лише в латиниці (й, ї лишаються)", () => {
    expect(normKey("Nico Hülkenberg")).toBe("nico hulkenberg");
    expect(normKey("Гюлькенберг Йоган Їжак")).toBe("гюлькенберг йоган їжак");
  });

  it("автор: подвоєння з розбору Commons — один раз; «невідомий» не рахується", () => {
    expect(cleanAuthor("Unknown authorUnknown author")).toBe("Unknown author");
    expect(cleanAuthor("Steffen Prößdorf")).toBe("Steffen Prößdorf");
    expect(isUnknownAuthor("Unknown photographer")).toBe(true);
    expect(isUnknownAuthor("neznámý (unknown)")).toBe(true);
    expect(isUnknownAuthor("Liauzh")).toBe(false);
  });
});
