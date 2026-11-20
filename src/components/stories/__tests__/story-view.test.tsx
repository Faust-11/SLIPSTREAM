// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import { getStory, getStorySlugs } from "@/lib/stories/content";
import { StoryView } from "../story-view";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** Розмітка історії: спільна для сайту й перегляду чернетки в адмінці (7c, задача 9). Перевіряємо на ВСІХ історіях і обох мовах. */
describe("StoryView", () => {
  it("усі історії × 2 мови рендеряться; сайт має структуровані дані й «Читайте також», перегляд — ні", async () => {
    for (const lang of ["uk", "en"] as const) {
      const dict = await getDictionary(lang);
      for (const slug of getStorySlugs()) {
        const story = getStory(slug, lang)!;
        const site = renderToStaticMarkup(<StoryView lang={lang} story={story} dict={dict} facts={null} />);
        const preview = renderToStaticMarkup(<StoryView lang={lang} story={story} dict={dict} facts={null} preview />);
        expect(site, `${slug}/${lang}`).toContain(`<h1 class="display">`);
        expect(site, `${slug}/${lang}`).toContain("application/ld+json");
        expect(preview, `${slug}/${lang}`).not.toContain("application/ld+json");
        expect(preview, `${slug}/${lang}`).not.toContain("st-more");
        // Решта сторінки в перегляді — та сама: заголовок, текст, джерела.
        expect(preview, `${slug}/${lang}`).toContain(`id="sources"`);
        expect(preview.includes(esc(story.title.main)), `${slug}/${lang}`).toBe(true);
      }
    }
  }, 60_000);
});
