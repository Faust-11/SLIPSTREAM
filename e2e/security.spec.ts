import { expect, test } from "@playwright/test";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

const EXPECTED: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

function cspDirectives(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((d) => d.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

test("заголовки безпеки на всіх типах відповідей", async ({ page, request }) => {
  await page.goto("/");
  const asset = await page.evaluate(() => document.querySelector<HTMLScriptElement>('script[src^="/_next/static/"]')?.src);
  expect(asset).toBeTruthy();
  for (const path of ["/", "/uk/teams", "/uk/nope", "/robots.txt", "/sitemap.xml", "/icon.svg", new URL(asset!).pathname]) {
    const res = await request.get(path);
    const h = res.headers();
    for (const [name, value] of Object.entries(EXPECTED)) expect(h[name], `${path}: ${name}`).toBe(value);
    expect(cspDirectives(h["content-security-policy"]), `${path}: CSP`).toEqual(CSP);
    expect(h["x-powered-by"], `${path}: x-powered-by`).toBeUndefined();
  }
});

test("редирект /en: Next не додає заголовки з headers() до відповідей redirects (зафіксована поведінка)", async ({ request }) => {
  // Замір 11.11 (next start 16.4.5): 308 без HSTS/CSP. Тіла немає, а цільова 200-відповідь їх має.
  // Якщо поведінка зміниться (або на Vercel — Task 8), тест сповістить — тоді вимагати заголовки й тут.
  const res = await request.get("/en/teams", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["strict-transport-security"]).toBeUndefined();
  const target = await request.get(res.headers()["location"]!);
  expect(target.headers()["strict-transport-security"]).toBe(EXPECTED["strict-transport-security"]);
});

for (const path of ["/", "/uk/stories", "/uk/nope", "/nope.png"]) {
  test(`CSP нічого не блокує: ${path} (тема, мова 404, стилі першого екрана)`, async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|CSP|Refused to/i.test(m.text())) messages.push(m.text());
    });
    page.on("pageerror", (e) => messages.push(e.message));
    await page.addInitScript(() => localStorage.setItem("ss-theme", "light"));
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(messages).toEqual([]);
  });
}

test("CSP не дає вбудувати сайт у фрейм", async ({ page, baseURL }) => {
  await page.setContent(`<iframe src="${baseURL}/" style="width:400px;height:300px"></iframe>`);
  const frame = page.frames()[1];
  // Заблокований фрейм не завантажує документ сайту.
  await expect.poll(async () => (await frame?.evaluate(() => document.title).catch(() => "")) ?? "").not.toContain("Slipstream");
});
