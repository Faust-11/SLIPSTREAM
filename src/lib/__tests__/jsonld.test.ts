import { afterEach, describe, expect, it, vi } from "vitest";
import { breadcrumbList, jsonLdHtml, siteIdentity } from "../jsonld";

afterEach(() => vi.unstubAllEnvs());

describe("jsonLdHtml", () => {
  it("екранує «<», щоб текст не міг закрити <script>", () => {
    const html = jsonLdHtml({ name: "</script><b>x" });
    expect(html).not.toContain("</script>");
    expect(html).toContain("\\u003c/script>");
    expect(JSON.parse(html).name).toBe("</script><b>x");
  });

  it("екранує U+2028 і U+2029", () => {
    const html = jsonLdHtml({ s: "a\u2028b\u2029c" });
    expect(html).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(html).s).toBe("a\u2028b\u2029c");
  });
});

describe("breadcrumbList", () => {
  it("абсолютні адреси, позиції з 1, корінь «Outlap», шлях з префіксом мови", () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    const ld = breadcrumbList("uk", [
      { name: "Пілоти", path: "/drivers" },
      { name: "Льюїс Гамільтон", path: "/drivers/hamilton" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Outlap", item: "https://outlap.org/uk" },
      { "@type": "ListItem", position: 2, name: "Пілоти", item: "https://outlap.org/uk/drivers" },
      { "@type": "ListItem", position: 3, name: "Льюїс Гамільтон", item: "https://outlap.org/uk/drivers/hamilton" },
    ]);
  });

  it("англійська — без префікса", () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    const ld = breadcrumbList("en", [{ name: "Teams", path: "/teams" }]);
    expect(ld.itemListElement.map((i) => i.item)).toEqual(["https://outlap.org/", "https://outlap.org/teams"]);
  });
});

describe("siteIdentity", () => {
  it("WebSite і Organization з назвою, мовою й логотипом на домені сайту", () => {
    vi.stubEnv("SITE_URL", "https://outlap.org");
    const [site, org] = siteIdentity("uk", "опис");
    expect(site).toMatchObject({ "@type": "WebSite", name: "Outlap", url: "https://outlap.org/uk", inLanguage: "uk", description: "опис" });
    expect(org).toMatchObject({ "@type": "Organization", name: "Outlap", url: "https://outlap.org", logo: "https://outlap.org/icon-512.png" });
  });
});
