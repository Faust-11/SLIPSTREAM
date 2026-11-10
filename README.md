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

Плани робіт — у `docs/plans/`, рішення — у `docs/decisions.md`, аудити — у `docs/audits/`.
