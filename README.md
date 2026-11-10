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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | продакшн-збірка |
| `npm run test` | Vitest (jsdom) |
| `npm run e2e` | Playwright: збірка + `next start` на порту 3100; `BASE_URL=<url>` — проти готового сайту |

Перший запуск e2e: `npx playwright install chromium`. На macOS 12 Chromium Playwright не підтримується — `PLAYWRIGHT_CHANNEL=chrome npm run e2e` (системний Chrome).

Плани робіт — у `docs/plans/`, рішення — у `docs/decisions.md`, аудити — у `docs/audits/`.
