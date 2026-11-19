import { describe, expect, it } from "vitest";
import { cleanAuthor, isUnknownAuthor, layoutCounts, licenseCounts, licenseFamily } from "@/lib/data/credits";
import { contactEmail, serviceText } from "../content";
import { creditsHtml } from "../credits-html";
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

  it("перелік авторів як HTML: усе екрановано, посилання лише https", () => {
    const kinds = { driver: "Пілот", team: "T", season: "S", race: "R", circuit: "C", layout: "L", story: "St" };
    const html = creditsHtml(
      [
        { kind: "driver", label: "<b>X</b>", alt: 'A"B', href: "https://commons.wikimedia.org/wiki/File:X&Y.jpg", author: "O'Neil <script>", license: "CC BY 2.0" },
        { kind: "team", label: "T", alt: null, href: "javascript:alert(1)", author: "a", license: "b" },
      ],
      kinds,
    );
    expect(html).toBe(
      '<li data-alt="A&quot;B"><span class="sv-kind">Пілот</span> <a href="https://commons.wikimedia.org/wiki/File:X&amp;Y.jpg" rel="noopener">&lt;b&gt;X&lt;/b&gt;</a> <span class="sv-by">— <span translate="no">O&#39;Neil &lt;script&gt;</span>, CC BY 2.0</span></li>' +
        '<li><span class="sv-kind">T</span> <a href="#" rel="noopener">T</a> <span class="sv-by">— <span translate="no">a</span>, b</span></li>',
    );
  });
});
