# Рішення (ADR-лайт)

## 2026-11-10 · Next.js 16.4.5 замість 16.2.9
За GitHub Advisory DB (10.11) next@16.2.9 уражений 20 advisory: 5 critical (GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-vcvr-r3jv-pc5j, GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36), 6 high, 8 medium, 1 low; у лінійці 16.2.x виправлень немає. Обрано 16.4.5: її реліз закриває 7 moderate-advisory, уразливих до 16.4.4 включно (серед них GHSA-mfr8-8qww-v76h, GHSA-pc58-hwjq-p385 — діапазон `<=16.4.4`, виправлено в 16.4.5; перелік — release notes v16.4.5). 16.4.6 не обрано: лише багфікси, вийшла за день до старту. Документація — з `node_modules/next/dist/docs/` встановленої версії. Деталі — `docs/audits/deps-phase1.md`.

## 2026-11-10 · Node ^22.13 || ≥ 24
`engines.node: "^22.13.0 || >=24"` (у плані було `>=22`): `eslint-visitor-keys@5.0.1` (через `typescript-eslint`) вимагає `^20.19.0 || ^22.13.0 || >=24`, а з `engine-strict=true` `npm ci` на Node 22.12 падає з `EBADENGINE` (перевірено рев'юером на офіційному Node 22.12.0). Node 23 не підтримується. Локально й у CI — Node 24 (`.nvmrc`).

## 2026-11-10 · React Compiler вимкнено
`create-next-app --no-react-compiler`: у плані фази 1 його немає; вмикати окремим рішенням після замірів.

## 2026-11-10 · `ignore-scripts=true`
У lock-файлі немає пакетів з install-скриптами; заборона закриває клас атак через `postinstall`. Браузери Playwright ставляться явною командою (`npx playwright install`), не скриптом. Побічний ефект: npm не виконує й власні `pre*`/`post*`-скрипти `package.json` — їх не використовуємо. Після кожної нової залежності — перевірити `hasInstallScript` у lock-файлі.

## 2026-11-10 · TypeScript 5.9.3
Версія генератора. `typescript-eslint` допускає `<6.1.0`, тобто TS 6.0 можливий; перехід — окремим рішенням після перевірки.

## 2026-11-10 · `favicon.ico` генератора видалено
Це логотип Next.js (демо-вміст). Власна іконка `src/app/icon.svg` з'являється в Task 6; до того `/favicon.ico` → 404.

## 2026-11-10 · `typecheck` = `next typegen && tsc --noEmit`
Глобальні типи `PageProps`/`LayoutProps` генеруються в `.next/types`, яких на чистому дереві (CI) немає до збірки.

## 2026-11-10 · Тестові інструменти (Task 2)
- `vite-tsconfig-paths` не встановлено: Vite 8 має `resolve.tsconfigPaths`.
- Додано `@testing-library/jest-dom` і `@testing-library/user-event` (у плані не названі).
- `jsdom` 29.1.1, не 30.x — сумісність з `engines`.
- Локально (macOS 12) e2e — у системному Chrome: `PLAYWRIGHT_CHANNEL=chrome`. CI — Chromium Playwright на ubuntu-latest.
- Actions закріплені за SHA комітів релізів; `permissions: contents: read`; `persist-credentials: false`.

## 2026-11-11 · Правки рев'ю Task 2
- e2e чекає відкритий порт, а не `200` на `/`; сервер перевикористовується лише з `PW_REUSE=1`.
- CI: `ubuntu-26.04` (замість `ubuntu-latest`), образ у ключі кешу браузерів; `cancel-in-progress` лише для PR.
- Dependabot (actions + npm) щотижня з `cooldown: 7` днів — працює після злиття в `main`.
- Відкладено: `incomplete`-результати axe логувати в Task 5/8; окреме `node`-середовище Vitest — коли з'являться тести завантажувачів (фаза 2); Node у `.nvmrc` = мажорна `24` (CI бере останню 24.x) — точну версію вирішити разом із налаштуванням Vercel.

## 2026-11-11 · Маршрутизація мов і 404 (Task 3, після рев'ю)
**Заміри.**
1. `notFound()`, викликаний зі сторінки, у Next 16.1.7 / 16.2.12 / 16.4.5 / 16.4.6 віддає сервером порожній документ `<html id="__next_error__">` (без `lang`, макета й тексту); 404 малює лише клієнт. Відкритий баг vercel/next.js#62228 (з 2024; дублікати #99287, #99793, #100596; незлиті PR #98583, #100648). Unmatched URL рендеряться сервером, але без `experimental.globalNotFound` — стандартною англійською заглушкою поза `[lang]/layout`.
2. Динамічний `global-not-found` (читав `headers()`) дає **500** на RSC-запитах (`/teams.rsc`, prefetch неіснуючих адрес): `InvariantError: Expected RSC response, got text/html … This is a bug in Next.js` (схоже — vercel/next.js#101449, закрито без виправлення).
3. Proxy в Next 16 працює на Node runtime (`proxy.md`) і викликається на кожен запит сторінки.

**Рішення.**
- Мови — правилами `redirects` (`/en`, `/en/:path*` → 308 без префікса) і `rewrites.afterFiles` (решта, крім `/uk…`, `/en…`, `_next/`, → `/en/…`) у `next.config.ts`. За `rewrites.md` `afterFiles` виконуються після файлів, але до динамічних маршрутів. `src/proxy.ts` немає; з'явиться лише для логіки на запит (фаза 7, вузький matcher).
- `src/app/global-not-found.tsx` — **статичний** і двомовний: без JS видно обидві секції з власним `lang`; inline-скрипт до першого кадру ставить `html[lang]` за адресою (`/uk…` → `uk`) і ховає іншу секцію. Заголовок вкладки нейтральний — «404 · Slipstream»: React під час гідратації повертає текст `<title>`, тож мовний заголовок скриптом не втримати (перевірено трасуванням).
- Неіснуючі параметри закривати через `dynamicParams = false` + `generateStaticParams` (unmatched → серверний 404). Явний `notFound()` — лише коли інакше не можна; для нього `src/app/[lang]/not-found.tsx` (мова після гідратації через `next/root-params`).
- Catch-all `[...rest]` не використовуємо: він перетворює unmatched URL на `notFound()` і повертає баг 1.
- e2e перевіряє сирий серверний HTML 404, RSC-запити (404, не 500) і редирект `/en//evil.com` (лише свій домен) — проганяти й проти прев'ю Vercel (Task 8), бо нормалізацію `//` там не перевірено.
- `public/e2e-probe.txt` — перевірка, що rewrite не ламає `public/`; замінити на реальний файл, коли з'являться фото (фаза 3).
