# Slipstream

Неофіційний фанатський сайт про Формулу-1. Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.

## Запуск

```bash
nvm use            # Node 24 (мінімум 22.13)
npm ci
npm run dev        # http://localhost:3000
```

## Перевірки

| Команда | Що робить |
|---|---|
| `npm run lint` | ESLint, без попереджень |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run build` | продакшн-збірка |
| `npm run test` | Vitest (jsdom) |
| `npm run e2e` | Playwright: збірка + `next start` на порту 3100; `BASE_URL=<url>` — проти готового сайту |

Перший запуск e2e: `npx playwright install chromium`. На macOS 12 Chromium Playwright не підтримується — `PLAYWRIGHT_CHANNEL=chrome npm run e2e` (системний Chrome). Перевикористати вже запущений `next start` на порту 3100 — `PW_REUSE=1` (інакше e2e завжди збирає свіжу версію). Прев'ю Vercel: `BASE_URL=<url> E2E_SITE_URL=<продакшн-домен> VERCEL_AUTOMATION_BYPASS_SECRET=<секрет> npm run e2e` (секрет обмінюється на cookie домену прев'ю в `e2e/vercel-bypass.setup.ts`).

Плани робіт — у `docs/plans/`, рішення — у `docs/decisions.md`, аудити — у `docs/audits/`.
