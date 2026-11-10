<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Slipstream — правила для агентів

- Плани фаз — `docs/plans/`, рішення — `docs/decisions.md`, аудити — `docs/audits/`.
- Мови: `en` без префікса, `uk` під `/uk`. Перехоплення запитів — лише `src/proxy.ts`.
- Версії залежностей — точні; нові залежності — лише після перевірки (`npm audit`, вік релізу, install-скрипти).
- Перед комітом: `npm run lint && npm run typecheck && npm run test && npm run build`.
