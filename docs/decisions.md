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

## 2026-11-11 · 404: `global-not-found` + мова з proxy (Task 3)
**Проблема (замір).** `notFound()`, викликаний зі сторінки, у Next 16.1.7 / 16.2.12 / 16.4.5 / 16.4.6 віддає сервером порожній документ `<html id="__next_error__">` — без `lang`, без макета, без тексту; 404-інтерфейс малює лише клієнт після гідратації. Відомий відкритий баг: vercel/next.js#62228 (з 2024), дублікати #99287, #99793, #100596; виправлення — незлиті PR #98583, #100648. Невідповідні маршрути (unmatched URL) рендеряться сервером, але стандартною англійською заглушкою Next поза нашим `[lang]/layout`.

**Рішення.**
- `experimental.globalNotFound` + `src/app/global-not-found.tsx` — 404 для всіх невідомих адрес рендериться сервером (документація радить саме його для кореневого layout у динамічному сегменті).
- Мову 404 визначає proxy за шляхом і передає заголовком запиту `x-ss-locale` (значення клієнта завжди перезаписується; e2e це перевіряє). Для шляхів повз proxy (файли з розширенням) клієнт може вибрати лише мову сторінки 404 — без наслідків для безпеки.
- Сторінки, що мають неіснуючі параметри, закривати через `dynamicParams = false` + `generateStaticParams` (тоді це unmatched → серверний 404). Явний `notFound()` — лише коли інакше не можна; для нього лишається `src/app/[lang]/not-found.tsx` (правильна мова після гідратації через `next/root-params`).
- Catch-all `[...rest]` не використовуємо: він перетворює unmatched URL на `notFound()` і повертає баг.
- `/_not-found` — динамічний (читає `headers()`), решта сторінок — SSG.
- Прибрати, коли Next виправить #62228: перевіряти e2e `expectServer404` після кожного оновлення Next.

## 2026-11-11 · Proxy не чіпає файли з розширенням
Matcher `/((?!_next/|.*\.[A-Za-z0-9]+$).*)`: proxy виконується раніше за роздачу `public/`, тож rewrite на `/en` зламав би файли. Наслідок: у slug сторінок не має бути крапки з «розширенням» наприкінці.
