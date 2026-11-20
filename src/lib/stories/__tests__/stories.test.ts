import { describe, expect, it } from "vitest";
import { getStory, getStoryList, getStorySlugs, splitTitle } from "../content";
import { countWords, parseInline, parseStory, readingMinutes, slugify } from "../markdown";

describe("розбирач тексту історій", () => {
  it("абзаци, глави, виноски, жирний і курсив", () => {
    const b = parseStory("## Перша глава\n\nТекст **жирний[^c2]** і *курсив*.[^c1]\nпродовження\n\n## Перша глава\n");
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "h2"]);
    expect(b[0]).toMatchObject({ id: "перша-глава" });
    expect(b[2]).toMatchObject({ id: "перша-глава-2" });
    expect(b[1]).toEqual({
      type: "p",
      c: [
        { t: "text", v: "Текст " },
        { t: "b", c: [{ t: "text", v: "жирний" }, { t: "fn", claim: "c2" }] },
        { t: "text", v: " і " },
        { t: "i", c: [{ t: "text", v: "курсив" }] },
        { t: "text", v: "." },
        { t: "fn", claim: "c1" },
        { t: "text", v: " продовження" },
      ],
    });
  });

  it("цитата: один рядок — лише оригінал; три — оригінал, переклад, хто", () => {
    expect(parseStory("> «Сам текст» (переклад Slipstream).[^c8]")[0]).toMatchObject({ type: "quote", tr: null, cite: null });
    const q = parseStory("> «I would not open the door.»\n> Я не відчиню двері.[^c9]\n> — Ален Прост · після гонки")[0];
    expect(q).toMatchObject({ type: "quote", cite: "Ален Прост · після гонки" });
    expect(q && q.type === "quote" && q.tr).toEqual([{ t: "text", v: "Я не відчиню двері." }, { t: "fn", claim: "c9" }]);
  });

  it("фото, віджети, :::tldr і :::timeline", () => {
    const b = parseStory("[[media:m2]]\n\n[[block:b1]]\n\n:::tldr\n- Перше.[^c1]\n- Друге\n:::\n\n:::timeline\n- 22.10.1989 | Гонка.[^c20]\n:::");
    expect(b.map((x) => x.type)).toEqual(["media", "widget", "tldr", "timeline"]);
    expect(b[3]).toMatchObject({ items: [{ date: "22.10.1989", c: [{ t: "text", v: "Гонка." }, { t: "fn", claim: "c20" }] }] });
  });

  it("зірочка всередині слова — не курсив; slug — без лапок", () => {
    expect(parseInline("5*3 і 2*4")).toEqual([{ t: "text", v: "5*3 і 2*4" }]);
    expect(slugify("«Гроші говорять»: фінал", new Set())).toBe("гроші-говорять-фінал");
  });

  it("слова й час читання: виноски й службові рядки не рахуються; ~140 слів/хв, мінімум 1", () => {
    expect(countWords("Раз два.[^c1]\n[[media:m1]]\n:::tldr\n- три\n:::")).toBe(3);
    expect([readingMinutes(1), readingMinutes(140), readingMinutes(141), readingMinutes(1031)]).toEqual([1, 1, 2, 8]);
  });

  it("заголовок у два рядки — за першою «: »", () => {
    expect(splitTitle("Spygate: шпигунство")).toEqual({ main: "Spygate", accent: "шпигунство", full: "Spygate: шпигунство" });
    expect(splitTitle("Без двокрапки")).toEqual({ main: "Без двокрапки", accent: null, full: "Без двокрапки" });
  });

  it("глава не займає id сторінки: «## Sources» → sources-2, «## S1» → ch-s1 (code-review PR #36)", () => {
    const ids = parseStory("## Sources\n\n## Disputed\n\n## S1\n").flatMap((b) => (b.type === "h2" ? [b.id] : []));
    expect(ids).toEqual(["sources-2", "disputed-2", "ch-s1"]);
  });
});

describe("історії з content/stories (усі файли репозиторію)", () => {
  const slugs = getStorySlugs();

  it("історій ≥ 30; у кожної є виноски в обох мовах і кожна виноска — відоме твердження", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(30);
    for (const slug of slugs) {
      for (const lang of ["uk", "en"] as const) {
        const s = getStory(slug, lang)!;
        const fns: string[] = [];
        const walk = (c: ReturnType<typeof parseInline>) => c.forEach((x) => (x.t === "fn" ? fns.push(x.claim) : "c" in x ? walk(x.c) : null));
        for (const b of s.blocks) {
          if (b.type === "p") walk(b.c);
          if (b.type === "quote") walk([...b.orig, ...(b.tr ?? [])]);
          if (b.type === "media") expect(s.media[b.id], `${slug}/${lang}: фото ${b.id}`).toBeDefined();
        }
        expect(fns.length, `${slug}/${lang}`).toBeGreaterThan(0);
        for (const f of fns) expect(s.claims[f], `${slug}/${lang}: ${f}`).toBeDefined();
        expect(s.toc.length, `${slug}: глави`).toBeGreaterThan(0);
      }
    }
  });

  it("номери джерел у виносках — позиції в списку джерел (1…N)", () => {
    const s = getStory("spygate-2007", "uk")!;
    const all = Object.values(s.claims).flatMap((c) => c.sources);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...all)).toBeLessThanOrEqual(s.sources.length);
    expect(s.sources[0]).toMatchObject({ n: 1, id: "s1" });
  });

  it("шкала перевірки = кількість тверджень за статусами", () => {
    const s = getStory("abu-dhabi-2021", "uk")!;
    expect(s.meter.ok + s.meter.one + s.meter.dis).toBe(s.meter.total);
    expect(s.meter.total).toBe(Object.keys(s.claims).length);
  });

  it("список: від нових до старих, розбори без року — наприкінці; пов'язані — без самої історії, до 4", () => {
    const list = getStoryList("uk");
    const years = list.map((c) => c.year);
    const firstNull = years.indexOf(null);
    const dated = firstNull === -1 ? years : years.slice(0, firstNull);
    expect(dated).toEqual([...dated].sort((a, b) => b! - a!));
    if (firstNull !== -1) expect(years.slice(firstNull).every((y) => y === null)).toBe(true);
    const s = getStory("brawn-gp-2009", "en")!;
    expect(s.related.length).toBeLessThanOrEqual(4);
    expect(s.related.some((r) => r.slug === "brawn-gp-2009")).toBe(false);
  });
});

describe("archiveUrl — копія джерела в Web Archive на сторінці історії", () => {
  it("показуємо лише справжній знімок web.archive.org; решту з даних ігноруємо", async () => {
    const { archiveUrl } = await import("../content");
    const ok = "https://web.archive.org/web/20261120140746/https://www.fia.com/news/x";
    expect(archiveUrl(ok)).toBe(ok);
    for (const bad of [undefined, null, 5, "", "javascript:alert(1)", "https://evil.example/web/20261120140746/https://a.example/", "http://web.archive.org/web/20261120140746/https://a.example/", "https://web.archive.org/web/2026/https://a.example/", `${ok} <script>`]) {
      expect(archiveUrl(bad), String(bad)).toBeNull();
    }
  });
});
