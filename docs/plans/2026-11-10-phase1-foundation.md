# Slipstream · Фаза 1 «Фундамент» — план реалізації

> **For agentic workers:** Implement this plan task-by-task, checking off each step; verify each task before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** каркас сайту Slipstream у `Faust-11/SLIPSTREAM`: Next.js 16, дві мови (EN без префікса, UK з `/uk`), шапка з десктопним і мобільним меню, футер, тема без мерехтіння, базове SEO, заголовки безпеки й автоматичні перевірки якості — усе зелене до того, як з'явиться перша сторінка з даними.

**Architecture:** App Router з сегментом `src/app/[lang]`; `src/proxy.ts` переписує URL без префікса на `en` і робить редирект `/en/*` → `/*`, щоб не було дублів. Дизайн-токени й шрифти переносяться з макетів (`~/Desktop/F1/data/_shared_css.txt`) у `globals.css` через Tailwind 4 `@theme`. Публічні сторінки статичні/ISR, тому CSP задається заголовком без nonce (nonce вимикає ISR — `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).

**Tech Stack:** Next.js 16.2.9, React 19.2, TypeScript (strict), Tailwind CSS 4, `next/font/google`, Vitest + Testing Library, Playwright + `@axe-core/playwright`, ESLint (`eslint-config-next`), GitHub Actions.

**Spec:** макети (опубліковані артефакти й генератори) у `~/Desktop/F1/data/*_mockup/` (`home_mockup`, `admin_mockup`, `nav_fix.py` — меню й мобільна панель), рішення користувача — у пам'яті проєкту `project_f1_predictor.md`. Документація Next.js 16 — лише з `node_modules/next/dist/docs/` (див. `AGENTS.md`).

## Дорожня карта (кожна фаза — окремий план, пишеться перед стартом фази)

| Фаза | Що | Скіли контролю якості |
|---|---|---|
| **1. Фундамент** (цей план) | каркас, мови, шапка/меню/футер, тема, SEO-база, безпека, CI | impeccable, web-design-guidelines, web-quality-audit, accessibility, seo-technical, seo-hreflang, insecure-defaults, supply-chain-risk-auditor, code-review, verification-before-completion |
| 2. Дані | схема `f1` (міграція 004 з `f1-predictor/feat/f1-history-db`), завантажувачі дампу й API, GitHub Actions, типізовані запити | supabase, supabase-postgres-best-practices, security-review (RLS), systematic-debugging |
| 3. Довідник | Сезони, сезон, гонка, календар, пілоти (список + картка), команди (картки + картка), траси (картки + картка) | dataviz, impeccable, seo-schema, seo-images, core-web-vitals, debug-optimize-lcp |
| 4. Головна і новини | RSS + Bluesky при запиті з кешем, прев'ю | performance, seo-page |
| 5. Контент | історії (рушій тверджень і джерел), «Новачкам», словник-підказки | copy-editing, a11y-debugging, seo-content, ai-seo |
| 6. Гра | «Гаряче коло», 4 траси, детермінована фізика | performance, playwright |
| 7. Адмінка | вхід лише для адмінів, розділи з макета v2 | security-audit, sharp-edges, insecure-defaults |
| 8. Перед запуском | службові сторінки, повний аудит SEO/швидкості/безпеки, домен | seo-audit, web-quality-audit, security-audit, lighthouse |
| 9. Вхід для відвідувачів | Google-вхід, рекорди гри | security-review |

**Рішення, потрібні до фази 5/7 (не блокують фазу 1):** де живе редагований контент — у репозиторії (адмінка комітить JSON/MDX: версії, diff і відкат дає git, бекап не потрібен) чи в базі (потрібен власний щоденний бекап). Рекомендація — у репозиторії; результати гонок лишаються в базі, бо відновлюються з Jolpica.

## Global Constraints

- Next.js **16.2.9**, React **19.2.x**, TypeScript `strict: true` + `noUncheckedIndexedAccess: true`; Node **≥ 22** (локально 24.13.1).
- Перехоплення запитів — тільки `src/proxy.ts` (файл `middleware` у Next 16 застарів).
- Мови: `en` — основна, **без префікса**; `uk` — під `/uk`. `/en` і `/en/*` → постійний редирект без префікса. `x-default` = EN.
- Безкоштовні тарифи: Vercel Hobby (cron лише раз на добу), GitHub Free (**2 000 хв Actions/міс** для приватних репо), Supabase Free (проєкт спільний з Predictor, дані Slipstream лише в схемі `f1`).
- Без логотипів F1 і команд; у футері: «Неофіційний фанатський сайт», дисклеймер про торгові марки, атрибуція Jolpica (CC BY-NC-SA 4.0).
- Фото — лише вільні ліцензії (виняток — прев'ю новин), автори — у футері, без підписів-плашок на фото.
- На сайті без пояснювальних приміток про те, як працює сайт.
- Шрифти: Rubik Mono One (заголовки, `word-spacing:-.35em`; у mono/body — `word-spacing:normal`), IBM Plex Sans, IBM Plex Mono; кирилиця обов'язкова.
- Тема: за замовчуванням — системна, перемикач зберігає `localStorage['ss-theme']` = `light|dark`; атрибут `data-theme` на `<html>`.
- Кольори першого екрана розділів: Історії `#E8002D`, Гра `#FF8000`, Новачкам `#27D9C2`, Календар `#1868DB`, Новини `#1E8A63`.
- Меню (порядок): Сезони · Календар · Новини · Пілоти · Команди · Траси · Історії · Новачкам · Гра (Гра — жовта).
- Доступність: WCAG 2.2 AA, axe — 0 порушень у світлій і темній темі.
- Бюджет: Lighthouse ≥ 95 у всіх категоріях на сторінках фази 1 (мобільний профіль); CLS < 0.1.
- До запуску: `robots` = `noindex, nofollow` на всіх сторінках (прев'ю не індексуємо).
- Жодних секретів у клієнтському коді; `.env*` у `.gitignore`, `.env.example` без значень.

## Review Focus

1. **Перемикання мови зберігає сторінку й параметри:** `/teams?q=lotus` ↔ `/uk/teams?q=lotus` — тест у Task 3.
2. **Неіснуюча мова чи сторінка:** `/de/teams`, `/uk/nope` → 404 тією ж мовою, а не 500 — тести в Task 3 і Task 6.
3. **Темна системна тема + збережена світла:** до гідратації `data-theme="light"`, без кадру в темній — тест у Task 4.
4. **Вузький екран 320 px:** шапка влазить, горизонтального скролу немає, бургер доступний — тест у Task 5.
5. **Без JavaScript:** усі розділи досяжні (посилання меню дублюються у футері) — тест у Task 5.

---

### Task 1: Каркас проєкту й інструменти

**Files:**
- Create (генератор): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*`, `AGENTS.md`, `CLAUDE.md`
- Create: `.nvmrc` (`24`), `.env.example`, `README.md`
- Modify: `tsconfig.json` (`noUncheckedIndexedAccess`), `package.json` (scripts, `engines.node: ">=22"`)

**Interfaces:**
- Produces: скрипти `npm run lint`, `typecheck` (`tsc --noEmit`), `build`, `test`, `e2e` (останні два додає Task 2).

- [ ] **Step 1:** `npx create-next-app@16.2.9 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --agents-md --disable-git` у клоні репозиторію (git уже є).
- [ ] **Step 2:** прибрати демо-вміст стартової сторінки й `public/*.svg` генератора; додати `typecheck`, `engines`, `.nvmrc`, `noUncheckedIndexedAccess`.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm run build` — Expected: усі три без помилок і попереджень.
- [ ] **Step 4:** `npm audit --omit=dev` — Expected: 0 high/critical; аудит залежностей скілом `supply-chain-risk-auditor` (звіт у `docs/audits/deps-phase1.md`).
- [ ] **Step 5:** Commit `chore: каркас Next.js 16.2.9`.

### Task 2: Тести й CI

**Files:**
- Create: `vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `src/lib/__tests__/smoke.test.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm run test` (Vitest, jsdom), `npm run e2e` (Playwright на `next build && next start`, порт 3100), хелпер `e2e/axe.ts`: `expectNoA11yViolations(page: Page): Promise<void>`.

- [ ] **Step 1:** dev-залежності: `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths @playwright/test @axe-core/playwright` (версії закріпити в lock-файлі).
- [ ] **Step 2:** тест `e2e/smoke.spec.ts`: `GET /` → статус 200; `expectNoA11yViolations`. Запуск `npm run e2e` — Expected: PASS.
- [ ] **Step 3:** CI `ci.yml`: на `push` у `main` і на PR; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`; кроки lint → typecheck → test → build → e2e (лише Chromium, з кешем `~/.cache/ms-playwright`). `timeout-minutes: 15`.
- [ ] **Step 4:** Push у гілку `phase1/foundation`, Expected: CI зелений; зафіксувати тривалість прогону (бюджет 2 000 хв/міс) у `docs/ci-budget.md`.
- [ ] **Step 5:** Commit `chore: тести й CI`.

### Task 3: Мови й маршрутизація

**Files:**
- Create: `src/i18n/config.ts`, `src/i18n/paths.ts`, `src/i18n/dictionaries/en.json`, `src/i18n/dictionaries/uk.json`, `src/i18n/get-dictionary.ts`, `src/proxy.ts`, `src/app/[lang]/layout.tsx`, `src/app/[lang]/page.tsx`
- Delete: `src/app/page.tsx`, `src/app/layout.tsx` (кореневий layout переїжджає в `[lang]`)
- Test: `src/i18n/__tests__/paths.test.ts`, `e2e/i18n.spec.ts`

**Interfaces:**
- Produces: `type Locale = 'en' | 'uk'`; `locales: readonly Locale[]`; `defaultLocale: 'en'`; `isLocale(x: string): x is Locale`;
  `localizedPath(path: string, locale: Locale): string` (`('/teams','uk')` → `'/uk/teams'`, `('/teams','en')` → `'/teams'`);
  `switchLocalePath(pathnameWithQuery: string, to: Locale): string`; `getDictionary(locale: Locale): Promise<Dictionary>`;
  у `[lang]/layout.tsx` — `generateStaticParams(): { lang: Locale }[]`, `dynamicParams = false`, `<html lang={lang}>`.

- [ ] **Step 1: тести (Vitest)** — `localizedPath('/','uk') === '/uk'`, `localizedPath('/','en') === '/'`; `switchLocalePath('/uk/teams?q=lotus','en') === '/teams?q=lotus'`; `switchLocalePath('/teams?q=lotus','uk') === '/uk/teams?q=lotus'`; `switchLocalePath('/uk','en') === '/'`; `isLocale('de') === false`.
- [ ] **Step 2:** запустити — Expected: FAIL (модулі не існують).
- [ ] **Step 3:** реалізувати `config.ts`, `paths.ts`; `proxy.ts`: шлях з `/en` → 308 на шлях без префікса; шлях без префікса (і не `/_next`, не файл зі статикою) → `NextResponse.rewrite` на `/en${path}`; `/uk…` — пропустити.
- [ ] **Step 4:** `npm run test` — Expected: PASS.
- [ ] **Step 5: e2e** — `/` → 200 і `html[lang=en]`; `/uk` → 200 і `html[lang=uk]`; `/en/teams` → 308 з `location: /teams`; `/de/teams` → 404; `/uk/nope` → 404 з `html[lang=uk]`. Expected: PASS.
- [ ] **Step 6:** Commit `feat: дві мови, EN без префікса`.

### Task 4: Дизайн-токени, шрифти, тема

**Files:**
- Create: `src/app/globals.css` (токени з `_shared_css.txt`: світлі на `:root`, темні — у `@media (prefers-color-scheme: dark) :root:not([data-theme=light])` і `:root[data-theme=dark]`), `src/app/fonts.ts`, `src/components/theme/theme-script.tsx`, `src/components/theme/theme-toggle.tsx`, `src/lib/theme.ts`
- Test: `src/lib/__tests__/theme.test.ts`, `e2e/theme.spec.ts`

**Interfaces:**
- Produces: `type ThemeChoice = 'light' | 'dark'`; `nextTheme(current: ThemeChoice): ThemeChoice`; `readStoredTheme(storage: Storage | null): ThemeChoice | null` (некоректні значення й винятки → `null`); `<ThemeScript />` (inline у `<head>`, ключ `ss-theme`); `<ThemeToggle labels={{ toLight: string; toDark: string }} />`.
- CSS-класи для наступних фаз: `.display` (Rubik Mono One, uppercase, `word-spacing:-.35em`), змінні `--f-display`, `--f-body`, `--f-mono`, кольори `--paper --paper-2 --ink --ink-soft --rule --hair --yellow --red --blue --blue-text --head-bg --head-fg`.

- [ ] **Step 1: тести** — `readStoredTheme(storageWith('dark')) === 'dark'`; `readStoredTheme(storageWith('purple')) === null`; `readStoredTheme(throwingStorage) === null`; `nextTheme('light') === 'dark'`.
- [ ] **Step 2:** FAIL → реалізація → PASS.
- [ ] **Step 3:** шрифти через `next/font/google` з `subsets: ['latin','cyrillic']` для Plex Sans/Mono; Rubik Mono One — перевірити наявність `cyrillic` у `next/font` (якщо немає — `subsets` лише доступні, і зафіксувати це в `docs/decisions.md`).
- [ ] **Step 4: e2e** — з `colorScheme: 'dark'` і `localStorage['ss-theme']='light'`: на `DOMContentLoaded` `document.documentElement.dataset.theme === 'light'`; клік перемикача змінює `data-theme` і `localStorage`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: токени, шрифти, тема без мерехтіння`.

### Task 5: Шапка, мобільне меню, футер

**Files:**
- Create: `src/config/nav.ts`, `src/components/site/header.tsx`, `src/components/site/brand.tsx` (SVG-роундел з `~/Desktop/F1/data/logo_gen.py`), `src/components/site/main-nav.tsx`, `src/components/site/lang-switch.tsx`, `src/components/site/mobile-menu.tsx` (client), `src/components/site/livery.tsx`, `src/components/site/footer.tsx`
- Modify: `src/app/[lang]/layout.tsx`, словники
- Test: `src/components/site/__tests__/mobile-menu.test.tsx`, `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `localizedPath`, `switchLocalePath`, `getDictionary`, `ThemeToggle`.
- Produces: `NAV: readonly { key: NavKey; href: string; accent?: 'yellow' }[]` з `NavKey = 'seasons'|'calendar'|'news'|'drivers'|'teams'|'circuits'|'stories'|'newbie'|'game'`; `SECTION_HERO: Partial<Record<NavKey, string>>` (кольори з Global Constraints).

- [ ] **Step 1: тест компонента** — `MobileMenu`: кнопка має `aria-expanded="false"`, `aria-controls`; клік → `true` і панель видима; `Escape` → закрито й фокус повернувся на кнопку; клік по посиланню закриває.
- [ ] **Step 2:** FAIL → реалізація → PASS. Активний пункт — `aria-current="page"`.
- [ ] **Step 3: e2e** — при 320, 360, 390 px: `scrollWidth <= innerWidth`, бургер видимий, десктопне меню приховане; при 1280 px навпаки; футер містить усі 9 посилань `NAV`; з вимкненим JS (`javaScriptEnabled:false`) футер-посилання ведуть на всі розділи; `expectNoA11yViolations` у світлій і темній темі.
- [ ] **Step 4:** перевірка дизайну: скіл `impeccable` (критика vs `home_mockup`) і `web-design-guidelines`; знахідки — виправити в цьому ж таску.
- [ ] **Step 5:** Commit `feat: шапка, мобільне меню, футер`.

### Task 6: Сторінки-заготовки, 404, метадані

**Files:**
- Create: `src/app/[lang]/{seasons,calendar,news,drivers,teams,circuits,stories,newbie,game}/page.tsx`, `src/components/site/section-hero.tsx`, `src/app/[lang]/not-found.tsx`, `src/app/[lang]/error.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/icon.svg`, `src/lib/seo.ts`
- Test: `src/lib/__tests__/seo.test.ts`, `e2e/seo.spec.ts`

**Interfaces:**
- Produces: `pageMetadata(args: { locale: Locale; path: string; title: string; description: string }): Metadata` — `alternates.canonical`, `alternates.languages` (`en`, `uk`, `x-default`), `openGraph.locale` (`en_GB` / `uk_UA`), `robots: { index: false, follow: false }` поки `process.env.SITE_INDEXING !== 'on'`.

- [ ] **Step 1: тести** — `pageMetadata({locale:'uk', path:'/teams', …}).alternates.languages` = `{ en: '/teams', uk: '/uk/teams', 'x-default': '/teams' }`; canonical для `uk` = `/uk/teams`; `robots.index === false` без `SITE_INDEXING`.
- [ ] **Step 2:** FAIL → реалізація → PASS.
- [ ] **Step 3:** заготовка розділу = `SectionHero` (назва розділу, колір із `SECTION_HERO`), без пояснювального тексту. `not-found.tsx` не отримує `params` — мову визначати з `usePathname()` (client-компонент) через `isLocale(segment)`; перевірити це в документації `03-api-reference/03-file-conventions/not-found.md` перед реалізацією.
- [ ] **Step 4: e2e** — кожна з 9 сторінок → 200 в обох мовах, має `<link rel=alternate hreflang=uk|en|x-default>` і `<meta name=robots content="noindex, nofollow">`; `/robots.txt` містить `Disallow: /`; `/sitemap.xml` містить обидві мовні версії кожної сторінки; `/uk/nope` → 404 з українським текстом.
- [ ] **Step 5:** скіли `seo-technical` і `seo-hreflang` по локальному білду; знахідки — виправити.
- [ ] **Step 6:** Commit `feat: розділи-заготовки, 404, SEO-база`.

### Task 7: Заголовки безпеки

**Files:**
- Modify: `next.config.ts` (`headers()`, `poweredByHeader: false`)
- Test: `e2e/security.spec.ts`

**Interfaces:**
- Produces: заголовки на всіх відповідях: `Content-Security-Policy` (`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- [ ] **Step 1: e2e** — відповідь `/` і `/uk/teams` містить усі заголовки вище; немає `x-powered-by`; у консолі сторінки 0 повідомлень про CSP.
- [ ] **Step 2:** FAIL → реалізація → PASS.
- [ ] **Step 3:** скіл `insecure-defaults` по `next.config.ts`, `proxy.ts`, CI; знахідки — виправити.
- [ ] **Step 4:** Commit `feat: заголовки безпеки`.

### Task 8: Перевірка фази

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm run test && npm run build && npm run e2e` — Expected: усе зелене.
- [ ] **Step 2:** Lighthouse (chrome-devtools-mcp `lighthouse_audit`, мобільний профіль) для `/`, `/uk/teams`, 404 — Expected: ≥ 95 у кожній категорії; скіл `web-quality-audit` — звіт у `docs/audits/phase1-quality.md`.
- [ ] **Step 3:** скіл `code-review` по гілці; виправити підтверджені знахідки.
- [ ] **Step 4:** скіл `verification-before-completion`; PR `phase1/foundation` → `main`, CI зелений.
- [ ] **Step 5:** користувач імпортує репозиторій у Vercel (новий проєкт у тому ж акаунті, Root Directory — корінь, Node 24) — перевірити прев'ю-URL тими ж e2e (`BASE_URL=<preview>`).
