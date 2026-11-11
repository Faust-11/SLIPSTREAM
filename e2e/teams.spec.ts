import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

const cards = (page: Page) => page.locator(".teams-grid .tc");
const visibleCards = (page: Page) => page.locator(".teams-grid .tc");

async function hydrated(page: Page) {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

for (const [path, h1, facts] of [
  ["/uk/teams", "Команди", ["164 конструктори", "15 володарів Кубка", "38 переможців гонок"]],
  ["/teams", "Teams", ["164 constructors", "15 title winners", "38 race winners"]],
] as const) {
  test(`${path}: заголовок, числа зі знімка, 24 картки, перші 11 — сезон 2026 за позицією`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.locator(".facts li")).toHaveText([...facts]);
    await hydrated(page);
    await expect(visibleCards(page)).toHaveCount(24);
    const tags = await visibleCards(page).locator(".tc-pos [aria-hidden]").allTextContents();
    expect(tags).toEqual(Array.from({ length: 11 }, (_, i) => `2026 · P${i + 1}`));
    expect(errors).toEqual([]);
  });
}

test("картка McLaren: колір команди, пілоти 2026 з аватарами; картка без фото — код країни", async ({ page }) => {
  await page.goto("/uk/teams?q=mclaren");
  await hydrated(page);
  const mclaren = page.getByRole("article", { name: "McLaren" });
  await expect(mclaren.locator(".tc-art")).toHaveCSS("border-bottom-color", "rgb(255, 128, 0)");
  await expect(mclaren.locator(".tc-crew li")).toHaveText(["Норріс", "Піастрі"]);
  await expect(mclaren.locator(".tc-crew img")).toHaveCount(2);
  await expect(mclaren.getByRole("img", { name: "Болід McLaren" })).toBeVisible();
  // Без фото (команди 1950-х Indy 500): заглушка з кодом країни, без <img>.
  await page.goto("/uk/teams?q=lesovsky");
  await hydrated(page);
  const noPhoto = visibleCards(page).first();
  await expect(noPhoto.locator(".tc-none")).toHaveText(/^[A-Z]{3}$/);
  await expect(noPhoto.locator("img")).toHaveCount(0);
});

test("«Показати ще» до кінця: 164 картки, кнопка зникає, фокус на першій новій картці", async ({ page }) => {
  await page.goto("/uk/teams");
  await hydrated(page);
  const more = page.getByRole("button", { name: /Показати ще/ });
  await expect(more).toHaveText("Показати ще 24 з 140");
  for (let shown = 24; shown < 164; shown += 24) {
    await more.click();
    await expect(visibleCards(page)).toHaveCount(Math.min(shown + 24, 164));
    await expect(visibleCards(page).nth(shown)).toBeFocused();
  }
  await expect(more).toHaveCount(0);
});

test("параметри в URL і перемикач мови (Review Focus 1)", async ({ page }) => {
  await page.goto("/uk/teams?q=lotus&f=win&sort=a");
  await hydrated(page);
  await expect(page.getByRole("searchbox")).toHaveValue("lotus");
  await expect(page.getByRole("button", { name: "Переможці гонок" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Сортувати" })).toHaveValue("a");
  const ukNames = await visibleCards(page).locator("h2").allTextContents();
  expect(ukNames.length).toBeGreaterThan(0);
  expect(ukNames.every((n) => /lotus/i.test(n))).toBe(true);
  const toEn = page.getByRole("group", { name: "Мова" }).getByRole("link");
  await expect(toEn).toHaveAttribute("href", "/teams?q=lotus&f=win&sort=a");
  await toEn.click();
  await expect(page).toHaveURL(/\/teams\?q=lotus&f=win&sort=a$/);
  // Зміна мови перемонтовує layout — чекаємо англійську сторінку, а не старий атрибут гідратації.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Teams");
  await expect(page.getByRole("button", { name: "Race winners" })).toHaveAttribute("aria-pressed", "true");
  expect(await visibleCards(page).locator("h2").allTextContents()).toEqual(ukNames);
});

test("зміни інструментів пишуться в URL без нових записів історії", async ({ page }) => {
  await page.goto("/uk/teams");
  await hydrated(page);
  const before = await page.evaluate(() => history.length);
  await page.getByRole("searchbox").fill("ferr");
  await expect(page).toHaveURL(/\/uk\/teams\?q=ferr$/);
  await page.getByRole("combobox", { name: "Сортувати" }).selectOption("w");
  await expect(page).toHaveURL(/\/uk\/teams\?q=ferr&sort=w$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page.getByRole("group", { name: "Мова" }).getByRole("link")).toHaveAttribute("href", "/teams?q=ferr&sort=w");
});

test("сміття в URL (Review Focus 2): 200, стан за замовчуванням, query ніде не відображено", async ({ page }) => {
  const evil = "%3Cscript%3Ealert(1)%3C%2Fscript%3E";
  const res = await page.goto(`/uk/teams?f=evil&sort=${evil}&x=${evil}`);
  expect(res?.status()).toBe(200);
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Усі" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Сортувати" })).toHaveValue("p");
  await expect(visibleCards(page)).toHaveCount(24);
  expect(await page.content()).not.toContain("<script>alert(1)");
  const longQ = "a".repeat(300);
  await page.goto(`/uk/teams?q=${longQ}`);
  await hydrated(page);
  expect((await page.getByRole("searchbox").inputValue()).length).toBe(100);
  await expect(page.getByText(/^Нічого не знайдено за запитом «a+»\.$/)).toBeVisible();
});

test.describe("без JavaScript (Review Focus 4)", () => {
  test.use({ javaScriptEnabled: false });

  test("видно всі 164 команди: 24 картки + решта списком; інструменти й «Показати ще» приховані", async ({ page }) => {
    await page.goto("/uk/teams");
    await expect(cards(page)).toHaveCount(24);
    await expect(page.locator(".teams-rest li")).toHaveCount(140);
    await expect(page.locator(".teams-rest")).toHaveAttribute("start", "25");
    await expect(page.locator(".teams-rest li").first()).toContainText(/Гран-прі \d/);
    // Кожна з 164 команд — рівно один раз (картки + список).
    const names = [
      ...(await cards(page).locator("h2").allTextContents()),
      ...(await page.locator(".teams-rest li b").allTextContents()),
    ];
    expect(names).toHaveLength(164);
    expect(new Set(names).size).toBe(164);
    await expect(page.locator(".teams-tools")).toBeHidden();
    await expect(page.getByRole("button", { name: /Показати ще/ })).toBeHidden();
  });
});

test("числа першого екрана не виходять за свої клітинки на вузьких екранах (UA і EN)", async ({ page }) => {
  test.setTimeout(120_000); // 12 переходів
  for (const path of ["/uk/teams", "/teams"])
    for (const width of [320, 360, 390, 420, 480, 520]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      const over = await page.locator(".facts li").evaluateAll((ls) =>
        ls.some((l) => [...l.children].some((c) => c.getBoundingClientRect().right > l.getBoundingClientRect().right + 0.5)),
      );
      expect(over, `${path} @${width}`).toBe(false);
    }
});

for (const width of [320, 390, 768, 1024, 1280]) {
  test(`${width} px: без горизонтального скролу, сітка за шириною`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/uk/teams");
    await hydrated(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const cols = await page.locator(".teams-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(width <= 520 ? 1 : width <= 860 ? 2 : width <= 1100 ? 3 : 4);
  });
}

test("фото далеко нижче першого екрана не завантажуються до прокрутки (Review Focus 5)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const requested: string[] = [];
  page.on("request", (r) => r.resourceType() === "image" && requested.push(decodeURIComponent(r.url())));
  await page.goto("/uk/teams");
  await hydrated(page);
  await page.waitForLoadState("networkidle");
  // Картки 21–24 (з фото) — далеко за першим екраном і запасом lazy-loading Chrome.
  const far = await visibleCards(page).evaluateAll((cs) =>
    cs.slice(20).map((c) => c.querySelector(".tc-art img")?.getAttribute("src")).filter(Boolean) as string[],
  );
  const id = (src: string) => decodeURIComponent(src).match(/\/img\/cars\/[^&]+\.jpg/)?.[0] ?? src;
  const farIds = far.map(id);
  expect(farIds.length).toBeGreaterThan(0);
  expect(requested.filter((u) => farIds.some((f) => u.includes(f)))).toEqual([]);
  await visibleCards(page).nth(22).scrollIntoViewIfNeeded();
  await expect.poll(() => requested.filter((u) => farIds.some((f) => u.includes(f))).length).toBeGreaterThan(0);
});

test("автори фото: кожне показане фото є в переліку з автором і ліцензією", async ({ page }) => {
  await page.goto("/uk/teams");
  await hydrated(page);
  const credits = page.locator(".page-credits");
  await expect(credits.locator("summary")).toHaveText(["Фото болідів: автори й ліцензії", "Портрети пілотів: автори й ліцензії"]);
  const carItems = credits.locator("details").first().locator("li");
  await expect(carItems).toHaveCount(127);
  for (const li of await carItems.all()) {
    await expect(li).toHaveText(/^.+: .+, (CC|Public domain|OGL)/);
    // Перелік згорнутий (<details>) — посилання шукаємо в DOM, не в дереві доступності.
    await expect(li.locator("a")).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  }
  await expect(credits.locator("details").nth(1).locator("li")).toHaveCount(22);
});

test("внутрішні посилання сторінки ведуть на існуючі сторінки", async ({ page, request }) => {
  await page.goto("/uk/teams");
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
  for (const href of hrefs) {
    const res = await request.get(href.split("#")[0]!, { maxRedirects: 0 });
    expect(res.status(), href).toBe(200);
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`без порушень axe: ${colorScheme}, ${width} px, /uk/teams і порожній стан`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk/teams");
      await hydrated(page);
      await expectNoA11yViolations(page);
      await page.getByRole("searchbox").fill("zzz");
      await expect(page.getByText("Нічого не знайдено за запитом «zzz».")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
}

test.describe("дизайн-рев'ю 11.11", () => {
  test("посилання зі станом: до гідратації список прихований, після — відфільтрований", async ({ page }) => {
    await page.goto("/uk/teams?q=ferrari");
    await hydrated(page);
    await expect(page.locator("html")).not.toHaveAttribute("data-list-query");
    await expect(page.locator(".teams-grid")).toBeVisible();
    await expect(visibleCards(page).locator("h2")).toHaveText(["Ferrari"]);
  });

  test("посилання зі станом, а JS не завантажився: список з'являється за запобіжником (≤ 6 с)", async ({ page }) => {
    await page.route("**/_next/static/chunks/*.js", (r) => r.abort());
    await page.goto("/uk/teams?q=ferrari");
    await expect(page.locator("html")).toHaveAttribute("data-list-query", "");
    await expect(page.locator(".teams-grid")).toHaveCSS("visibility", "hidden");
    await expect(page.locator(".teams-grid")).toHaveCSS("visibility", "visible", { timeout: 9000 });
  });

  test("автори фото й футер — без світлого «шва» між ними", async ({ page }) => {
    await page.goto("/uk/teams");
    const gap = await page.evaluate(() => {
      const credits = document.querySelector(".page-credits")!.getBoundingClientRect();
      const foot = document.querySelector(".site-foot")!.getBoundingClientRect();
      return Math.round(foot.top - credits.bottom);
    });
    expect(gap).toBe(0);
  });

  test("390 px: компактна картка ≤ 280 px, перша команда видна на першому екрані, видно кількість", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/uk/teams");
    await hydrated(page);
    const first = visibleCards(page).first();
    const box = (await first.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(280);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await expect(page.locator(".teams-count")).toHaveText("Знайдено 164 команди");
    // Чипи — один ряд.
    const tops = await page.locator(".chip").evaluateAll((cs) => new Set(cs.map((c) => Math.round(c.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
  });

  test("числа з розрядами за мовою: 1 143 (UA) і 1,143 (EN); на 320 px між числами ≥ 16 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/uk/teams?q=ferrari");
    await hydrated(page);
    await expect(page.getByRole("article", { name: "Ferrari" }).locator("dd").first()).toHaveText("1 143");
    const gaps = await page.getByRole("article", { name: "Ferrari" }).locator("dd").evaluateAll((dds) => {
      const r = dds.map((d) => {
        const range = document.createRange();
        range.selectNodeContents(d);
        return range.getBoundingClientRect();
      });
      return [r[1]!.left - r[0]!.right, r[2]!.left - r[1]!.right];
    });
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(16);
    await page.goto("/teams?q=ferrari");
    await hydrated(page);
    await expect(page.getByRole("article", { name: "Ferrari" }).locator("dd").first()).toHaveText("1,143");
  });
});

test.describe("рев'ю коду Task 3–4", () => {
  test("клік «Команди» в шапці скидає пошук — стан списку слідом за адресою", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/uk/teams");
    await hydrated(page);
    await page.getByRole("searchbox").fill("lotus");
    await expect(page).toHaveURL(/\?q=lotus$/);
    await page.getByRole("navigation", { name: "Головне меню" }).getByRole("link", { name: "Команди" }).click();
    await expect(page).toHaveURL(/\/uk\/teams$/);
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(visibleCards(page)).toHaveCount(24);
    await expect(page.getByRole("group", { name: "Мова" }).getByRole("link")).toHaveAttribute("href", "/teams");
  });

  test("сторонні параметри адреси (utm, fbclid) не стираються", async ({ page }) => {
    await page.goto("/uk/teams?q=lotus&utm_source=fb&fbclid=abc");
    await hydrated(page);
    await page.getByRole("button", { name: "Переможці гонок" }).click();
    await expect(page).toHaveURL(/\?q=lotus&f=win&utm_source=fb&fbclid=abc$/);
  });

  for (const qs of ["?q=lotus", "?q=zzz", "?f=ch&sort=t"]) {
    test(`CLS посилання зі станом ${qs} < 0.1 (390 і 1280 px)`, async ({ page }) => {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(() => {
          (window as unknown as { __cls: number }).__cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
              if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(`/uk/teams${qs}`);
        await hydrated(page);
        await expect(page.locator("html")).not.toHaveAttribute("data-list-query");
        await page.waitForTimeout(500);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, `${qs} @${width}`).toBeLessThan(0.1);
      }
    });
  }

  test("після гідратації серверні картки не перестворюються (гідратація, а не клієнтський рендер)", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __removed: number }).__removed = 0;
      new MutationObserver((ms) => {
        for (const m of ms)
          for (const n of m.removedNodes)
            if (n instanceof Element && n.classList.contains("tc")) (window as unknown as { __removed: number }).__removed++;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/uk/teams");
    await hydrated(page);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0);
    await expect(visibleCards(page)).toHaveCount(24);
  });
});

test("параметри q/f/sort на інших сторінках не ховають футер (code-review PR #5)", async ({ page }) => {
  for (const url of ["/uk?f=1", "/uk/drivers?sort=x"]) {
    await page.goto(url);
    await expect(page.locator("html")).not.toHaveAttribute("data-list-query");
    await expect(page.locator(".site-foot")).toHaveCSS("visibility", "visible");
  }
});
