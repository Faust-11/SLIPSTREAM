// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStoryJson } from "../format";
import { applyStoryPhoto, nextMediaId, roleFor } from "../media";

const raw = (slug: string) => readFileSync(join(process.cwd(), "content/stories", slug, "story.json"), "utf8");
const variants = (id: string, widths: number[]) => widths.map((w) => ({ name: `/img/stories/jerez-1997/${id}-${w}.webp`, width: w, height: Math.round(w * 0.6), data: new Uint8Array([1]) }));
const base = { credit: { page: "https://commons.wikimedia.org/wiki/File:X.jpg", author: "A", license: "CC BY 4.0" }, focus: "40% 30%", caption: { uk: "п", en: "c" }, alt: { uk: "о", en: "a" } };

describe("applyStoryPhoto", () => {
  it("заміна hero: лише запис m1 у story.json, файли 1280/800/480, порядок ключів як у наявних", () => {
    const json = raw("jerez-1997");
    const r = applyStoryPhoto(json, "jerez-1997", { ...base, id: "m1", variants: variants("m1", [1280, 800, 480]) });
    expect(r.role).toBe("hero");
    const before = parseStoryJson(json).story;
    const after = parseStoryJson(r.json).story;
    expect(Object.keys(after.media![0]!)).toEqual(["id", "role", "src", "srcSet", "width", "height", "focus", "credit", "caption", "alt"]);
    expect(after.media![0]).toMatchObject({ id: "m1", role: "hero", src: "/img/stories/jerez-1997/m1-1280.webp", focus: "40% 30%", width: 1280, height: 768 });
    expect(after.media![0]!.srcSet).toBe("/img/stories/jerez-1997/m1-1280.webp 1280w, /img/stories/jerez-1997/m1-800.webp 800w, /img/stories/jerez-1997/m1-480.webp 480w");
    expect(after.media!.slice(1)).toEqual(before.media!.slice(1));
    expect({ ...after, media: 0 }).toEqual({ ...before, media: 0 });
    expect(r.changes.map((c) => c.path)).toEqual([
      "public/img/stories/jerez-1997/m1-1280.webp",
      "public/img/stories/jerez-1997/m1-800.webp",
      "public/img/stories/jerez-1997/m1-480.webp",
      "content/stories/jerez-1997/story.json",
    ]);
  });
  it("нове inline-фото: наступний id, у кінець media, роль inline", () => {
    const json = raw("jerez-1997");
    const media = parseStoryJson(json).story.media!;
    const r = applyStoryPhoto(json, "jerez-1997", { ...base, id: "new", variants: variants(nextMediaId(media), [800, 480]) });
    expect(r.id).toBe(nextMediaId(media));
    const after = parseStoryJson(r.json).story.media!;
    expect(after).toHaveLength(media.length + 1);
    expect(after.at(-1)).toMatchObject({ id: r.id, role: "inline" });
  });
  it("заміна з іншими іменами файлів: старі, яких не перезапишуть, видаляються (існуючі шляхи)", () => {
    const json = JSON.stringify({ slug: "s", media: [{ id: "m2", role: "inline", src: "/img/stories/s/m2-768.webp", srcSet: "/img/stories/s/m2-768.webp 768w, /img/stories/s/m2-480.webp 480w", width: 768, height: 500 }] }, null, 2);
    const r = applyStoryPhoto(json, "s", { ...base, id: "m2", variants: [{ name: "/img/stories/s/m2-800.webp", width: 800, height: 500, data: new Uint8Array([1]) }, { name: "/img/stories/s/m2-480.webp", width: 480, height: 300, data: new Uint8Array([1]) }] });
    const deletes = r.changes.filter((c) => "content" in c && c.content === null).map((c) => c.path);
    expect(deletes).toEqual(["public/img/stories/s/m2-768.webp"]);
  });
  it("роль і помилки", () => {
    const story = parseStoryJson(raw("jerez-1997")).story;
    expect(roleFor(story, "m1")).toBe("hero");
    expect(roleFor(story, "new")).toBe("inline");
    expect(roleFor(story, "m99")).toBeNull();
    expect(() => applyStoryPhoto(raw("jerez-1997"), "jerez-1997", { ...base, id: "m99", variants: variants("m99", [800]) })).toThrow("немає фото m99");
  });
  it("nextMediaId: найбільший + 1, порожній список — m1", () => {
    expect(nextMediaId([])).toBe("m1");
    expect(nextMediaId([{ id: "m1" }, { id: "m7" }, { id: "x" }])).toBe("m8");
  });
});
