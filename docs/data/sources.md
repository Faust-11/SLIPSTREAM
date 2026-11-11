# Дані сайту: звідки що береться (з фази 2)

| Що | Де | Хто оновлює |
|---|---|---|
| Результати, заліки, кола, піт-стопи, сезони, траси, пілоти, конструктори | Supabase, схема `f1` (міграції `supabase/migrations/`) | `data-sync.yml`: дамп Jolpica (`scripts/jolpica/load_dump.py`) + доливка гонок після дампу з API (`topup_api.py`) |
| Похідні числа розділу «Команди» (Гран-прі, перемоги, Кубки, роки, місце, склад) | `f1.team_index`, `f1.site_meta` (матеріалізовані, `f1.refresh_derived()`) | наприкінці кожного завантаження, у тій самій транзакції |
| Що вважати однією командою (ref Jolpica → команда сайту) | `src/data/curated/teams.json` → `f1.team_families` (`scripts/db/seed_curated.py`) | вручну, коли з'являється новий конструктор (`seed_curated.py --strict` падає) |
| Назви кирилицею, країни, фото й автори, кольори команд | `src/data/curated/teams.json` | вручну (у фазі 7 — адмінка) |
| Пілоти поточних складів: укр. ім'я, фото, автор | `src/data/curated/drivers.json` | вручну; новачок без запису — латиницею з бази, без фото |
| Фікстура бази для unit/e2e | `e2e/fixtures/db/*.json` (вивантаження `scripts/db/export_fixture.py`, артефакт `db.yml`) | вручну, коли потрібні свіжі числа в тестах |
| Знімок фази 3a | `src/data/snapshot/teams.json` | більше не оновлюється — фікстура тестів паритету |

Правила підрахунку — `supabase/migrations/0002_team_index.sql` (шапка) і `docs/audits/phase3a-data.md`.
Сайт читає базу лише під час збірки (`src/lib/data/db.ts`, PostgREST, ключ publishable — роль anon); після синхронізації `data-sync.yml` викликає deploy hook Vercel.
