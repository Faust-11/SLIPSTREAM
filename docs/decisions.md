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
