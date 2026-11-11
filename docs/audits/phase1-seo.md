# SEO-аудит фази 1 (Task 6, 11.11.2026)

Локальна збірка з `SITE_URL=https://slipstream.example`, `next start`. Інструменти: скіли `seo-hreflang` (власний скрипт перевірки за його чек-листом), `seo-technical` (`sitemap_discovery.py`, `agentic_check.py` з `CLAUDE_SEO_LOCAL_TARGETS=localhost:…`), curl.

## hreflang — 0 проблем (замір, 20 сторінок + sitemap)
- Кожна сторінка: `en`, `uk`, `x-default` (= EN), self-reference = canonical, `html[lang]` = hreflang self, зворотні теги — повна сітка, лише `https://`, без кінцевого `/` (крім кореня — і там так само, як canonical Next).
- `sitemap.xml`: 20 `<url>` (10 сторінок × 2 мови), `xmlns:xhtml`, у кожного запису всі 3 альтернативи; `<loc>` = canonical сторінки. Знайдено й виправлено: корінь у sitemap був `https://host/`, а canonical Next — `https://host` (тепер однаково).

## Технічне
| Перевірка | Результат |
|---|---|
| robots.txt | 200, `User-Agent: *` / `Disallow: /` (навмисно до запуску), `Sitemap:` — абсолютний URL з `SITE_URL` |
| sitemap | валідний `urlset` (`sitemap_discovery.py`) |
| noindex | `noindex, nofollow` на всіх сторінках, поки `SITE_INDEXING != on` — навмисно |
| Редиректи | 1 крок: `/en/teams` → `/teams`, `/uk/` → `/uk`, `/teams/` → `/teams` (308) |
| Параметри | `/teams?utm=1` → 200, canonical без параметра |
| Регістр | `/UK/teams` → 404 (не дубль) |
| viewport | `width=device-width, initial-scale=1`, масштабування не заблоковано |
| Рендер без JS | `h1`, метадані, canonical, robots — у серверному HTML; `agentic_check`: 97 слів без JS (заготовки без контенту — фаза 3) |
| AI-краулери | заблоковані разом з усіма до запуску (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`) — переглянути при `SITE_INDEXING=on` |
| Заголовки безпеки | Task 7 |
| Core Web Vitals | Task 8 (Lighthouse) |
| Structured data | немає — фаза 3 (`seo-schema`: WebSite, SportsEvent тощо) |
| IndexNow | не потрібно до запуску — фаза 8 |

## Перед запуском (фаза 8)
- `SITE_URL` = продакшн-домен, `SITE_INDEXING=on` → robots `Allow`, `index, follow`.
- Вирішити політику AI-краулерів (окремі групи в `robots.ts`).
