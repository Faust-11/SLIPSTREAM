# Slipstream · Фаза 8 «Запуск» — план

> **For agentic workers:** Implement this plan task-by-task, checking off each step; verify each task before moving on.

**Goal:** підготувати сайт до відкритого запуску: службові сторінки, повний аудит (SEO, швидкість, доступність, безпека),
домен, зняти noindex. Фаза 1 (`2026-11-10-phase1-foundation.md`, рядок «8. Перед запуском»): службові сторінки, повний аудит
SEO/швидкості/безпеки, домен; навички seo-audit, web-quality-audit, security-audit, lighthouse.

## Стан на 15.11 (замір)
- **Індексація:** вимкнена механізмом фази 1 — `SITE_INDEXING` не задано → `noindex, nofollow` у layout (`robotsMetadata()`),
  `robots.txt` `Disallow: /`; на прев'ю Vercel індексація неможлива навіть з помилковою змінною (`VERCEL_ENV`). Зняти =
  `SITE_INDEXING=on` у Production + redeploy (`docs/decisions.md`, рядки 97–102).
- **Домен:** прод — `slipstream-bice-eight.vercel.app` (власного немає). `SITE_URL` береться з `VERCEL_PROJECT_PRODUCTION_URL`.
  HSTS — `max-age=63072000` без `includeSubDomains; preload` «до рішення про домен».
- **Службових сторінок немає:** у футері — «Неофіційний фанатський сайт», дисклеймер F1/FIA, дані Jolpica (CC BY-NC-SA 4.0).
  Немає «Про сайт», «Конфіденційність», «Джерела й ліцензії»; автори фото — згорнуті переліки внизу кожної сторінки.
- **Соцмережі / прев'ю посилань:** `opengraph-image` / `twitter-image` немає (замір `find src/app`), `manifest`/`apple-icon`
  немає; є `icon.svg`.
- **Аналітики немає** (замір: жодного `@vercel/analytics`, `speed-insights`, сторонніх скриптів); cookies сайт не ставить.
  `localStorage`: тема (`src/lib/theme.ts`) і рекорди гри (`src/lib/game/store.ts`) — лише в браузері відвідувача.
- **Ліцензія даних:** Jolpica — CC BY-NC-SA 4.0 → сайт некомерційний (без реклами, рішення 09.11) і з атрибуцією; ShareAlike
  стосується похідних наборів даних, які ми публікуємо (таблиці на сторінках) — зазначити на сторінці ліцензій.
- **Репо публічне з 14.11** (квоту Actions вичерпано); закрити до 1.12 — тоді CI/data-sync без хвилин (див. пам'ять).
- **Домени (RDAP, 15.11 — гіпотеза, не перевірено в реєстраторі):** `slipstream.fan`, `slipstreamfans.com` — RDAP 404
  (ймовірно, вільні); `slipstream.racing`, `slipstream.club`, `theslipstream.net` — зайняті. «F1» у домені не ставимо
  (торгова марка Formula One Licensing B.V.).

## Рішення користувача 15.11
1. **Домен — купуємо власний** (купує користувач). Назву обирає користувач з таблиці варіантів (доступність + ціна
   реєстрації й продовження) — підбираю я; без «F1». Я налаштовую DNS на Vercel, редирект
   `*.vercel.app` → домен, `SITE_URL`, HSTS.
2. **Службові сторінки: «Про сайт» і «Джерела й ліцензії».** Окремої «Конфіденційності» не робимо — короткий блок
   «Що зберігає сайт» (аналітика без cookies, `localStorage` теми й рекордів гри, сторонні картинки/відео) — у «Про сайт».
3. **Аналітика — Vercel Web Analytics** (без cookies). Перед увімкненням — замір: ліміт Hobby, які запити йдуть (CSP
   `script-src`/`connect-src`), вплив на Lighthouse.
5. **Контакт у «Про сайт» — пошта на домені** (напр. `hello@<домен>`) з пересиланням на скриньку користувача; особиста
   адреса на сайті не з'являється.
4. **noindex знімаємо після аудиту й домену** — пошуковики бачать одразу фінальну адресу.

## Задачі (чорнетка — уточнюється відповідями)

### Task 1: Службові сторінки («Про сайт», «Джерела й ліцензії»)
Макет: https://claude.ai/artifact/RyhHaGGWe7EkWMv6HP1smo (прийнято 15.11). `/[lang]/about`, `/[lang]/sources`; тексти —
`content/service/{uk,en}.json`; зведений перелік авторів — `src/lib/data/credits.ts` (усі файли Commons з кураторських даних
та історій, без дублів; числа сторінки — звідси). Контакт — `SITE_CONTACT_EMAIL` (Production, після домену); без неї —
«адреса з'явиться разом із доменом».
- [x] «Про сайт»: що це, неофіційність, звідки дані, як перевіряємо історії (шкала джерел), контакт.
- [x] Блок «Що зберігає сайт» у «Про сайт»: Vercel Web Analytics (без cookies), `localStorage` (тема, рекорди гри), сторонні
  запити (Bluesky API новин — серверні; картинки formula1.com/motorsport.com/YouTube — з браузера відвідувача).
- [x] «Джерела й ліцензії»: Jolpica (CC BY-NC-SA 4.0), Wikimedia Commons (автори — зведений перелік), OpenStreetMap/MIT схем
  трас, офіційні документи FIA; посилання з футера.
- [x] Посилання у футері; sitemap; метадані; e2e.

### Task 2: Прев'ю посилань і іконки — ЗРОБЛЕНО іншим діалогом (c0579c4: JPEG-картки розділів і фото, scripts/og/build.mjs); тут лише картки about/sources (`--only service`). Іконки apple-icon/manifest — перевірити в аудиті
- [ ] `opengraph-image` (загальна + для сторінок з власним фото — гонка, історія, пілот), `twitter-image`, `apple-icon`,
  `manifest` (назва, кольори теми).

### Task 3: Аудит (окрема збірка з `SITE_INDEXING=on`, щоб noindex не псував SEO-оцінку)
- [ ] SEO: seo-audit / seo-technical (canonical, hreflang, sitemap, JSON-LD, заголовки, внутрішні посилання, 404).
- [ ] Швидкість і доступність: Lighthouse усіх шаблонів + web-quality-audit; CWV-бюджети.
- [ ] Безпека: security-audit (заголовки, CSP, `/api/news`, залежності `npm audit`, секрети в репо — репо публічне),
  Dependabot PR #2–#4 (оновлення залежностей) — розібрати тут.
- [ ] Звіт `docs/audits/2026-11-launch.md`: факти (заміри) окремо від гіпотез; виправлення — окремими PR.

### Task 3b: Vercel Web Analytics
- [ ] Замір ліміту Hobby і механіки (скрипт `/_vercel/insights/*` з того самого домену?), CSP, вплив на LCP/TBT; потім — увімкнути.

### Task 4: Домен
- [ ] Реєстрація (робить користувач), DNS на Vercel, редирект `*.vercel.app` → домен, `SITE_URL`, HSTS `includeSubDomains`
  (preload — окреме рішення), перевірка e2e проти нового домену.

### Task 5: Запуск
- [ ] `SITE_INDEXING=on` (Production) → redeploy → перевірка: `robots.txt` Allow + sitemap, `index, follow` на всіх `<loc>`.
- [ ] Google Search Console / Bing Webmaster (користувач — власник), подати sitemap.
- [ ] Пам'ять: стан запуску; рішення про закриття репо (1.12).
