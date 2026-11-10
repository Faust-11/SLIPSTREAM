<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Slipstream — правила для агентів

- Плани фаз — `docs/plans/`, рішення — `docs/decisions.md`, аудити — `docs/audits/`.
- Мови: `en` без префікса, `uk` під `/uk`. Правила мов — `redirects`/`rewrites` у `next.config.ts`; 404 — `app/global-not-found.tsx`; неіснуючі параметри — `dynamicParams = false`, не `notFound()` (див. `docs/decisions.md`).
- Версії залежностей — точні; нові залежності — лише після перевірки (`npm audit`, вік релізу, install-скрипти).
- Перед комітом: `npm run lint && npm run typecheck && npm run test && npm run build`.
