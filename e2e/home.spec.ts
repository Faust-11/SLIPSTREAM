import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Головна (фаза 4b). Еталони — фікстура db.yml (сезон 2026: 20 з 23, чемпіон Антонеллі) і макет головної; час
// зафіксовано (page.clock), щоб відлік не залежав від дати прогону.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
});

test("/uk: герой, чемпіон, смуга сезону, остання й наступна гонка, залік, рекорди", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto("/uk");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уся Формула-1. Коло за колом.");
  // 21.11: рядок «Програмка вболівальника · Сезон 2026 · 20 з 23 етапів позаду» прибрано з шапки.
  await expect(page.locator(".hm-hero-main")).not.toContainText("Програмка вболівальника");
  await expect(page.locator(".hm-hero-main")).not.toContainText("етапів позаду");
  await expect(page.locator(".hm-lede")).toContainText("Від першого старту 1950 року");
  // Рішення 21.11: картку чемпіона в шапці замінила «Цей день у Формулі-1» (докладно — тести нижче).
  await expect(page.locator("#hm-otd-h")).toHaveText("Цей день у Формулі-1");
  await expect(page.locator(".hm-champ")).toHaveCount(0);
  await expect(page.locator(".hm-rail-cell")).toHaveCount(23);
  await expect(page.locator(".hm-rail-cell.hm-rail-next")).toHaveCount(1);
  await expect(page.locator(".hm-rail-cell.hm-rail-next .num")).toHaveText("21");
  await expect(page.locator("#hm-last-h")).toHaveText("Гран-прі Бразилії");
  await expect(page.locator(".hm-tbl tbody tr")).toHaveCount(10);
  await expect(page.locator(".hm-podium > li")).toHaveCount(3);
  await expect(page.locator("#hm-next-h")).toHaveText("Гран-прі Лас-Вегаса");
  await expect(page.locator(".hm-count b").first()).toHaveText("6"); // 15.11 12:00 → 22.11 04:00 = 6 дн 16 год
  await expect(page.locator(".hm-next-a .hm-map svg path")).toHaveCount(2);
  expect(await page.locator("#hm-st-0 > li").count()).toBeGreaterThan(10);
  await expect(page.locator(".hm-rec").nth(2).locator(".hm-rec-top")).toContainText("Ferrari");
  // Рішення 14.11: кнопка гри веде на /game; кнопки прогнозу немає. 15.11: блоку «Новачкам» на головній немає (рішення користувача).
  await expect(page.getByRole("link", { name: "Проїхати гаряче коло →" })).toHaveAttribute("href", "/uk/game");
  // Підказка словника на «Старт» у таблиці останньої гонки.
  await page.locator('.hm-tbl .gt-t[data-term="grid"]').click();
  await expect(page.locator("#gt-s-grid")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#gt-s-grid")).toBeHidden();
  await expect(page.getByText("Мій прогноз на подіум")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("/: англійська, h1 і кнопка результатів ведуть на сторінку гонки", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("All of Formula 1. Lap by lap.");
  await expect(page.getByRole("link", { name: /^Results: / })).toHaveAttribute("href", "/seasons/2026/20");
});

test("усі внутрішні посилання головної існують", async ({ page, request }) => {
  await page.goto("/uk");
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.split("#")[0]!))]);
  expect(hrefs.length).toBeGreaterThan(20);
  for (const h of hrefs) expect((await request.get(h)).status(), h).toBe(200);
});

test("перемикач заліку: «Команди» прокручує до панелі команд і стає активним", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const tabs = page.locator(".hm-standings .hm-tabs button");
  await expect(tabs.first()).toHaveAttribute("aria-pressed", "true");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("#hm-st").evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.locator("#hm-st-1 > li").first()).toBeInViewport();
});

test("новини: клієнт підвантажує /api/news (знімок e2e/fixtures/news) — по 10 заголовків і постів, посилання назовні", async ({ page }) => {
  await page.goto("/uk");
  await expect(page.locator("#hm-nw-0 > li")).toHaveCount(10);
  await expect(page.locator("#hm-nw-1 .hm-posts > li")).toHaveCount(10);
  await expect(page.locator("#hm-nw-0 a").first()).toHaveAttribute("href", /^https:\/\//);
  // Пост: доступна назва посилання — не лише час, а й автор.
  await expect(page.locator("#hm-nw-1 .hm-post-link").first()).toContainText("пост");
  // Прев'ю видань — як на /news (відгук користувача 15.11).
  await expect(page.locator("#hm-nw-0 img.hm-th").first()).toBeAttached();
  // Прев'ю — мініатюра 112 px поруч із заголовком, а не на всю колонку; заголовок без підкреслення (лише при наведенні).
  const look = await page.locator("#hm-nw-0 > li").first().evaluate((li) => ({
    th: li.querySelector("img")!.getBoundingClientRect().width,
    deco: getComputedStyle(li.querySelector(".hm-hl-t")!).textDecorationLine,
  }));
  expect(look.th).toBeLessThanOrEqual(120);
  expect(look.deco).toBe("none");
});

test("широкий екран: колонка журналістів не нижча за заголовки — зайві пости сховані цілими (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk");
  await expect(page.locator("#hm-nw-0 > li")).toHaveCount(10);
  await page.locator("#hm-nw-0 img").evaluateAll((imgs) => Promise.all(imgs.map((i) => ((i as HTMLImageElement).loading = "eager"))));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = document.getElementById("hm-nw-0")!.getBoundingClientRect();
        const posts = [...document.querySelectorAll<HTMLElement>("#hm-nw-1 .hm-posts > li:not([hidden])")];
        return posts.length > 0 && posts.at(-1)!.getBoundingClientRect().bottom <= h.bottom + 1;
      }),
    )
    .toBe(true);
});

test("схема наступної траси: значок рухається (animateMotion по тому самому шляху); «менше руху» — схований", async ({ page }) => {
  await page.goto("/uk");
  await expect(page.locator(".hm-next-a .hm-map-car animateMotion mpath")).toHaveAttribute("href", "#hm-map-route-a");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".hm-next-a .hm-map-car")).toBeHidden();
});

test("гонка стартувала до оновлення даних: «стартувала», відлік — до етапу 22 (як календар)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-22T05:00:00Z"));
  await page.goto("/uk");
  await expect(page.locator(".hm-count-note")).toContainText("етап 22");
  await expect(page.locator(".hm-count b").first()).toHaveText("7"); // 22.11 05:00 → Катар 29.11 16:00 = 7 дн 11 год
});

test("чемпіонат і рекорди (1280): низ трьох списків рекордів = низ панелі заліку; «Повний залік» — рівні відступи (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/uk");
  const m = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect();
    const panel = r(document.getElementById("hm-st-0")!);
    const link = r(document.querySelector(".hm-standings > .hm-more")!);
    const col = r(document.querySelector(".hm-standings")!);
    const lists = [...document.querySelectorAll(".hm-rec-list")].map((l) => r(l).bottom);
    const rec = r(document.querySelector(".hm-records")!);
    return { panelBottom: panel.bottom, above: link.top - panel.bottom, below: col.bottom - link.bottom, lists, recBottom: rec.bottom, colBottom: col.bottom };
  });
  expect(Math.abs(m.above - m.below)).toBeLessThanOrEqual(2);
  for (const b of m.lists) expect(Math.abs(b - m.panelBottom)).toBeLessThanOrEqual(2);
  expect(Math.abs(m.recBottom - m.colBottom)).toBeLessThanOrEqual(1);
  // Числа рекордів і розділювачі під лідерами — на одній лінії в усіх трьох колонках (відгук 15.11: «7» з двома лідерами).
  const tops = await page.locator(".hm-rec").evaluateAll((rs) =>
    rs.map((r) => ({ num: r.querySelector(".hm-rec-top > b")!.getBoundingClientRect().top, sep: r.querySelector(".hm-rec-top")!.getBoundingClientRect().bottom })),
  );
  for (const t of tops) {
    expect(Math.abs(t.num - tops[0]!.num)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.sep - tops[0]!.sep)).toBeLessThanOrEqual(1);
  }
  // Списки прокручуються, як у макеті: у кожному рекордсменів більше, ніж уміщається.
  for (const over of await page.locator(".hm-rec-list").evaluateAll((ls) => ls.map((l) => l.scrollHeight > l.clientHeight))) expect(over).toBe(true);
});

test("рекорди на телефоні — вкладки «Перемоги / Титули / Кубки» в одному блоці (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const tabs = page.locator(".hm-records .hm-tabs button");
  await expect(tabs).toHaveCount(3);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#hm-rc-2 .hm-rec-top")).toBeInViewport();
});

test("автори фото — найнижчий рядок підвалу, без окремого блока між сторінкою й підвалом (відгук 15.11)", async ({ page }) => {
  await page.goto("/uk");
  const m = await page.evaluate(() => {
    const c = document.querySelector(".page-credits")!.getBoundingClientRect();
    const f = document.querySelector(".site-foot")!.getBoundingClientRect();
    return { gap: c.top - f.bottom, docEnd: document.documentElement.scrollHeight - (c.bottom + window.scrollY) };
  });
  expect(Math.abs(m.gap)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.docEnd)).toBeLessThanOrEqual(1);
});

test("телефон — без окремого подіуму, таблиця одразу після банера; ПК — наступна гонка на червоній панелі (відгук 15.11)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await expect(page.locator(".hm-podium")).toBeHidden();
  const gap = await page.evaluate(() => document.querySelector(".hm-tbl")!.getBoundingClientRect().top - document.querySelector(".hm-last .hm-banner")!.getBoundingClientRect().bottom);
  expect(gap).toBeLessThan(24);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".hm-podium")).toBeVisible();
  expect(await page.locator(".hm-next-a").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(180, 37, 24)");
});

test("21.11: шапка — кнопки внизу поруч зі смугою показників, фото решітки під текстом; відлік із секундами; без «Тут вигравали» й підписів «перевірено» в історіях", async ({ page }) => {
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const m = await page.evaluate(() => {
    const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
    return { lede: r(".hm-lede").bottom, ctas: r(".hm-ctas"), stats: r(".hm-stats").top };
  });
  expect(m.ctas.top).toBeGreaterThan(m.lede + 40); // між текстом і кнопками — вільне місце під фото
  expect(m.stats - m.ctas.bottom).toBeLessThan(40); // кнопки впритул до смуги показників
  await expect(page.locator(".hm-hero-photo")).toHaveAttribute("src", /grid-1100\.webp$/);
  await expect(page.locator(".page-credits")).toContainText("Mark McArdle");
  // Відлік: чотири комірки, секунди — дві цифри й змінюються щосекунди.
  await expect(page.locator(".hm-next-a .hm-count b")).toHaveCount(4);
  await expect(page.locator(".hm-next-a .hm-count span").nth(3)).toHaveText("сек");
  await expect(page.locator(".hm-next-a .hm-count b").nth(3)).toHaveText(/^\d{2}$/);
  await expect(page.locator(".hm-past")).toHaveCount(0);
  await expect(page.getByText("Тут вигравали")).toHaveCount(0);
  await expect(page.locator(".hm-stories")).not.toContainText("перевірено");
  // «Цей день»: рік і текст запису — від одного верху (раніше назва «з'їжджала» нижче року).
  await page.locator(".hm-otd .hm-otd-ev").first().waitFor();
  const align = await page.evaluate(() => {
    const ev = document.querySelector(".hm-otd .hm-otd-ev")!;
    return ev.querySelector(".hm-otd-yr")!.getBoundingClientRect().top - ev.querySelector(".hm-otd-tag")!.getBoundingClientRect().top;
  });
  expect(Math.abs(align)).toBeLessThanOrEqual(4);
});

for (const width of [320, 390, 768, 1100])
  test(`шапка в одну колонку (${width} px): панель із фото — від краю до краю екрана, без світлої смуги збоку`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/uk");
    const m = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { vw: document.documentElement.clientWidth, main: q(".hm-hero-main"), photo: q(".hm-hero-photo") };
    });
    expect(m.main.left).toBeLessThanOrEqual(0.5);
    expect(m.main.right).toBeGreaterThanOrEqual(m.vw - 0.5);
    expect(m.photo.left).toBeLessThanOrEqual(0.5);
    expect(m.photo.right).toBeGreaterThanOrEqual(m.vw - 0.5);
  });

test("телефон 21.11: наступна гонка — червона й над минулою; без таблиці трас гри", async ({ page }) => {
  const seen: string[] = [];
  await page.route("**/api/weather/**", (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  expect(await page.locator(".hm-next-a").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(180, 37, 24)");
  const order = await page.evaluate(() => ({
    next: document.querySelector(".hm-next")!.getBoundingClientRect().top,
    last: document.querySelector(".hm-last")!.getBoundingClientRect().top,
  }));
  expect(order.next).toBeLessThan(order.last);
  // 23.11: у червоній панелі є кнопка «Зробити прогноз» → прогноз на наступний етап (білий фон, червоний текст).
  const cta = page.locator(".hm-next-a .hm-btn-onred");
  await expect(cta).toHaveText("Зробити прогноз");
  await expect(cta).toHaveAttribute("href", /\/uk\/predictions\/\d+$/);
  expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.locator(".hm-game").scrollIntoViewIfNeeded();
  await expect(page.locator(".hm-board")).toBeHidden();
  await page.waitForTimeout(700);
  expect(seen, "на телефоні запиту до погоди нема").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // ПК: таблиця трас гри на місці, наступна гонка — праворуч від минулої.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".hm-board")).toBeVisible();
  const row = await page.evaluate(() => ({
    next: document.querySelector(".hm-next")!.getBoundingClientRect().left,
    last: document.querySelector(".hm-last")!.getBoundingClientRect().left,
  }));
  expect(row.next).toBeGreaterThan(row.last);
});

const ROOT = "[data-section=home]";

test("22.11: головна перемикається за часом — до старту панель Лас-Вегаса; через 3 год після старту — Катар, смуга сезону й рядок про очікування результатів", async ({ page }) => {
  // Фейковий OpenF1 одразу віддає результати й замінює рядок карткою (окремий тест нижче); тут перевіряємо сам рядок — API «ще порожнє».
  await page.route("**/api/prelim/**", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.clock.setFixedTime(new Date("2026-11-22T03:00:00Z")); // до старту (04:00)
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(page.locator("#hm-next-h")).toBeVisible();
  await expect(page.locator("#hm-next-h-b")).toBeHidden();
  await expect(page.locator(".hm-pending")).toBeHidden();
  await expect(page.locator(ROOT)).toHaveAttribute("data-hm-next", "a");

  await page.clock.setFixedTime(new Date("2026-11-22T06:59:00Z")); // гонка триває — ще Лас-Вегас
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(page.locator("#hm-next-h")).toBeVisible();
  await expect(page.locator(".hm-pending")).toBeHidden();

  await page.clock.setFixedTime(new Date("2026-11-22T07:00:00Z")); // старт 04:00 + 3 год
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(page.locator(ROOT)).toHaveAttribute("data-hm-next", "b");
  await expect(page.locator("#hm-next-h-b")).toBeVisible();
  await expect(page.locator("#hm-next-h-b")).toHaveText("Гран-прі Катару");
  await expect(page.locator("#hm-next-h")).toBeHidden();
  await expect(page.locator(".hm-pending")).toBeVisible();
  await expect(page.locator(".hm-pending")).toContainText("Гран-прі Лас-Вегаса завершилось");
  // Відлік у видимій панелі — до Катару (22.11 07:00 → 29.11 16:00 = 7 дн 9 год); без запису «стартувала».
  await expect(page.locator(".hm-next-b .hm-count b").first()).toHaveText("7");
  await expect(page.locator(".hm-next-b .hm-count-note")).toHaveCount(0);
  // Смуга сезону узгоджена з панеллю: підписи «далі — етап 22», етап 21 — фінішував.
  await expect(page.locator('.hm-rail-key-next[data-s="b"]')).toBeVisible();
  await expect(page.locator('.hm-rail-key-next[data-s="b"]')).toContainText("Етап 22");
  await expect(page.locator('.hm-rail-key-next[data-s="a"]')).toBeHidden();
  await expect(page.locator('.hm-rail-key div[data-s="b"]').first()).toContainText("Етап 21");
  const bars = await page.evaluate(() => {
    const h = (sel: string) => Math.round(document.querySelector(`${sel} i`)!.getBoundingClientRect().height);
    return { a: h(".hm-rail-a"), b: h(".hm-rail-b"), before: h(".hm-rail-cell.hm-rail-done:has(+ .hm-rail-next)") };
  });
  expect(bars).toEqual({ a: 20, b: 20, before: 12 });
});

test("22.11: клієнтський перехід на головну й довго відкрита сторінка теж перемикають панель (inline-скрипт не виконується)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-22T08:00:00Z"));
  await page.goto("/uk/calendar");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.getByRole("link", { name: "Outlap" }).first().click(); // логотип → головна, без перезавантаження
  await expect(page.locator("#hm-next-h-b")).toBeVisible();
  await expect(page.locator(ROOT)).toHaveAttribute("data-hm-next", "b");
});

test("22.11: сторінка, відкрита до кінця гонки, перемикається сама", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-22T06:59:30Z") });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(page.locator("#hm-next-h")).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(page.locator("#hm-next-h-b")).toBeVisible();
  await expect(page.locator(".hm-pending")).toBeVisible();
});

test("22.11: після кінця гонки на телефоні — Катар червоний і над минулою гонкою, рядок про результати, без прокрутки вбік", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  expect(await page.locator(".hm-next-b").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(180, 37, 24)");
  const m = await page.evaluate(() => ({
    next: document.querySelector(".hm-next-b")!.getBoundingClientRect().top,
    last: document.querySelector(".hm-last")!.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(m.next).toBeLessThan(m.last);
  expect(m.overflow).toBeLessThanOrEqual(0);
  await expect(page.locator(".hm-pending")).toBeVisible();
});

test("/api/prelim/<мова>/<рік>/<етап>: попередні результати OpenF1 (фейк-сервіс) — імена з наших даних, час, відрив, статуси; нема гонки / не завершилась — 404", async ({ request }) => {
  const uk = await request.get("/api/prelim/uk/2026/21");
  expect(uk.status()).toBe(200);
  const body = await uk.json();
  expect(body).toMatchObject({ year: 2026, round: 21, sessionKey: 11420 });
  expect(body.rows.map((r: { position: number | null }) => r.position)).toEqual([1, 2, 3, 4, 5]);
  expect(body.rows[0]).toMatchObject({ number: 3, slug: "max-verstappen", timeMs: 5259624, gapMs: null, status: "finished", points: 25, color: "#3671C6" });
  expect(body.rows[1]).toMatchObject({ number: 1, gapMs: 639, team: "McLaren" });
  expect(body.rows[3]).toMatchObject({ lapsDown: 1, timeMs: null, gapMs: null });
  expect(body.rows[4]).toMatchObject({ status: "dnf", timeMs: null });
  expect(JSON.stringify(body)).not.toMatch(/@|email|user/i); // без персональних даних
  const en = await (await request.get("/api/prelim/en/2026/21")).json();
  expect(en.rows[0].name).toBe("Max Verstappen");
  expect(en.rows[0].name).not.toBe(body.rows[0].name); // мова впливає на ім'я
  expect((await request.get("/api/prelim/uk/2026/22")).status()).toBe(404); // Катар ще не їхали
  expect((await request.get("/api/prelim/uk/2022/10")).status()).toBe(404); // до 2023 — джерела нема
  expect((await request.get("/api/prelim/xx/2026/21")).status()).toBe(404);
  expect((await request.get("/api/prelim/uk/2026/99")).status()).toBe(404);
});

test("22.11: після кінця гонки картка «Попередні результати» (OpenF1) замінює рядок; до кінця — жодного запиту до /api/prelim", async ({ page }) => {
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/prelim/") && seen.push(new URL(r.url()).pathname));
  await page.clock.setFixedTime(new Date("2026-11-22T03:00:00Z"));
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.locator(".hm-last").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  expect(seen, "до завершення етапу запитів до OpenF1-маршруту нема").toEqual([]);

  await page.clock.setFixedTime(new Date("2026-11-22T08:00:00Z"));
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.locator(".hm-pending").scrollIntoViewIfNeeded();
  const card = page.locator(".hm-pending .hm-prelim");
  await expect(card).toBeVisible({ timeout: 20_000 }); // запит до API + окремий чанк картки
  expect(seen).toEqual(["/api/prelim/uk/2026/21"]);
  await expect(card.locator("h3")).toHaveText("Гран-прі Лас-Вегаса");
  await expect(card).toContainText("Попередні результати");
  await expect(card.locator(".hm-podium li")).toHaveCount(3);
  await expect(card.locator(".hm-podium li").first()).toContainText("P1");
  await expect(card.locator(".hm-podium li").first().locator("a")).toHaveAttribute("href", "/uk/drivers/max-verstappen");
  await expect(card.locator(".hm-podium li").first()).toContainText("1:27:39.624"); // 5259,624 с
  await expect(card.locator("tbody tr")).toHaveCount(5);
  await expect(card.locator("tbody tr").nth(1)).toContainText("+0.639");
  await expect(card.locator("tbody tr").nth(3)).toContainText("+1 коло");
  await expect(card.locator("tbody tr").nth(4)).toContainText("Схід");
  await expect(card.locator(".hm-prelim-src")).toContainText("OpenF1");
  await expect(card.locator(".hm-prelim-src a")).toHaveAttribute("href", "/uk/sources");
  await expect(page.locator(".hm-pending > p")).toHaveCount(0); // рядок «з'являться» замінено карткою
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 1280])
    test(`22.11: картка попередніх результатів без порушень axe й без прокрутки вбік: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.clock.setFixedTime(new Date("2026-11-22T08:00:00Z"));
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk");
      await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
      await page.locator(".hm-pending").scrollIntoViewIfNeeded();
      await expect(page.locator(".hm-pending .hm-prelim")).toBeVisible({ timeout: 20_000 });
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

test("22.11: помилка API попередніх результатів — лишається рядок «з'являться після оновлення», без картки", async ({ page }) => {
  await page.route("**/api/prelim/**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.clock.setFixedTime(new Date("2026-11-22T08:00:00Z"));
  await page.goto("/uk");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.locator(".hm-pending").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await expect(page.locator(".hm-pending > p")).toContainText("Гран-прі Лас-Вегаса завершилось");
  await expect(page.locator(".hm-prelim")).toHaveCount(0);
});

test.describe("без JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("обидві панелі заліку — у серверній розмітці; відлік — «—»; новин немає, є посилання «Усі новини»", async ({ page }) => {
    await page.goto("/uk");
    expect(await page.locator("#hm-st-0 > li").count()).toBeGreaterThan(10);
    await expect(page.locator("#hm-st-1 > li").first()).toBeAttached();
    await expect(page.locator(".hm-count b").first()).toHaveText("—");
    // Без JS перемикання нема: видна панель «наступного» за збіркою (b — прихована CSS), рядка про очікування немає.
    await expect(page.locator("#hm-next-h")).toBeVisible();
    await expect(page.locator("#hm-next-h-b")).toBeHidden();
    await expect(page.locator(".hm-pending")).toBeHidden();
    await expect(page.getByRole("link", { name: "Усі новини →" })).toHaveAttribute("href", "/uk/news");
  });
});

for (const theme of ["light", "dark"] as const)
  for (const width of [320, 390, 768, 1024, 1280])
    test(`без порушень axe; ніщо не виходить за екран: ${theme}, ${width} px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/uk");
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

test("CLS < 0.1 (390 px); розмір HTML ≤ 100 КБ gzip", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/uk", { waitUntil: "load" });
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  const { gzipSync } = await import("node:zlib");
  const res = await request.get("/uk");
  expect(gzipSync(await res.body()).length).toBeLessThan(100 * 1024);
});

/** Ключі днів, які є в розділі «Цей день» (зі sitemap), — стабільніше за жорстко прописані дати. */
async function historyDays(request: import("@playwright/test").APIRequestContext): Promise<string[]> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  return [...new Set(locs.map((l) => /\/history\/(\d{2}-\d{2})$/.exec(l)?.[1]).filter((d): d is string => !!d))].sort();
}

test("/uk: «Цей день у Формулі-1» у шапці — дата за годинником, події, посилання, сусідні дні", async ({ page, request }) => {
  const days = await historyDays(request);
  const day = days.includes("10-19") ? "10-19" : days[0]!;
  await page.clock.setFixedTime(new Date(`2026-${day}T12:00:00Z`));
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/uk");
  const card = page.locator(".hm-otd");
  await expect(card.locator(".hm-otd-ev").first()).toBeVisible();
  const n = await card.locator(".hm-otd-ev").count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  await expect(card.locator(".hm-otd-num")).toHaveText(String(Number(day.slice(3))));
  await expect(card.locator(".hm-otd-date")).toContainText(/[а-яі]/i);
  const links = await card.locator(".hm-otd-ev a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(links.every((h) => /^\/uk\/(drivers|seasons)\//.test(h))).toBe(true);
  await expect(card.locator(".hm-otd-all")).toHaveAttribute("href", `/uk/history/${day}`);
  for (const rel of ["prev", "next"]) {
    const href = await card.locator(`a[rel="${rel}"]`).getAttribute("href");
    expect(href).toMatch(/^\/uk\/history\/\d{2}-\d{2}$/);
    expect((await request.get(href!)).status()).toBe(200);
  }
  expect(errors).toEqual([]);
});

test("/uk: порожній день — картка показує найближчу дату з подіями й каже про це", async ({ page, request }) => {
  const days = new Set(await historyDays(request));
  const all = Array.from({ length: 12 }, (_, m) => Array.from({ length: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m]! }, (_, d) => `${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`)).flat();
  const empty = all.find((k) => !days.has(k));
  test.skip(!empty, "у фікстурі немає порожніх днів");
  await page.clock.setFixedTime(new Date(`2026-${empty}T12:00:00Z`));
  await page.goto("/uk");
  await expect(page.locator(".hm-otd .hm-otd-ev").first()).toBeVisible();
  await expect(page.locator(".hm-otd-date")).toContainText("найближча дата з подіями");
  await expect(page.locator(".hm-otd-all")).not.toHaveAttribute("href", `/uk/history/${empty}`);
});

test("/: англійська версія картки дня", async ({ page, request }) => {
  const days = await historyDays(request);
  await page.clock.setFixedTime(new Date(`2026-${days[0]}T12:00:00Z`));
  await page.goto("/");
  await expect(page.locator("#hm-otd-h")).toHaveText("This day in Formula 1");
  await expect(page.locator(".hm-otd .hm-otd-ev").first()).toBeVisible();
  await expect(page.locator(".hm-otd-all")).toContainText("Full history of the day");
  await expect(page.locator(".hm-otd-all")).toHaveAttribute("href", new RegExp(`^/history/\\d{2}-\\d{2}$`));
});

test("/api/on-this-day/<мова>/<день>: JSON дня; чужа мова чи неіснуюча дата — 404", async ({ request }) => {
  const days = await historyDays(request);
  const day = days[0]!;
  const ok = await request.get(`/api/on-this-day/uk/${day}`);
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.key).toBe(day);
  expect(body.exact).toBe(true);
  expect(body.events.length).toBeGreaterThanOrEqual(1);
  expect(body.events.length).toBeLessThanOrEqual(3);
  expect(body.prev).toMatch(/^\d{2}-\d{2}$/);
  expect((await request.get("/api/on-this-day/xx/10-19")).status()).toBe(404);
  expect((await request.get("/api/on-this-day/uk/13-40")).status()).toBe(404);
});

test("/uk (головна): «Погода вікенду» в блоці наступної гонки не показується (рішення 21.11 — блок став надто високим) і не робить запитів", async ({ page }) => {
  const seen: string[] = [];
  await page.route("**/api/weather/**", (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/uk"); // 15.11: до гонки 6,7 доби — раніше саме тоді блок з'являвся
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.locator(".hm-next-a").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(page.locator(".hm-next .ww-slot, .hm-next .ww")).toHaveCount(0);
    await expect(page.locator(".hm-next").filter({ hasText: "Погода вікенду" })).toHaveCount(0);
  }
  expect(seen, "запиту до погоди з головної нема").toEqual([]);
});
