# Slipstream · Фаза 3a «Команди» (перша сторінка з даними) — план реалізації

> **For agentic workers:** Implement this plan task-by-task, checking off each step; verify each task before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** живий розділ `/teams` і `/uk/teams` — картки 164 конструкторів за затвердженим макетом (фото боліда, країна, смуга сезонів 1950–2026, Гран-прі / перемоги / Кубки, у команд 2026 — позиція, колір і пілоти), пошук, фільтри, сортування, «Показати ще»; плюс дві правки шапки, погоджені користувачем 11.11.

**Architecture:** дані — **знімок у репозиторії** (`src/data/snapshot/teams.json` + фото в `public/img/`), який збирає скрипт із локальних даних макетів `~/Desktop/F1/data`. Сторінка читає знімок лише через типізований шар `getTeamsIndex(locale)` — у фазі 2 його реалізацію замінимо на запит до Supabase (схема `f1`), а контракт-тест перевірить, що результат збігається зі знімком. Сторінка статична: сервер рендерить усі картки в порядку за замовчуванням (без JS видно всі), клієнтський компонент після гідратації застосовує пошук/фільтр/сортування з URL (`?q=&f=&sort=`) і показує по 24.

**Tech Stack:** Next.js 16.4.5 (App Router, `next/image`), React 19.2, TypeScript strict, Tailwind 4 + `site.css`, Vitest, Playwright + axe, Python 3 (лише скрипт знімка, запускається вручну).

**Spec:** макет «Команди» https://claude.ai/artifact/Bdk2NXnj1R9girNi1voxJ7 — локально `~/Desktop/F1/data/index_mockup/teams/index.html`, генератор `~/Desktop/F1/data/teams_cards/build_teams.py` (+ `teams.css`, `teams.js`, спільні стилі `circuits_cards/circuits.css`); правила й рішення — `docs/decisions.md`, пам'ять `project_f1_predictor.md`; рішення користувача 11.11: «Гра» — жовта плашка, мова — «UA», ліврейна смуга лишається; Global Constraints фази 1 (`docs/plans/2026-11-10-phase1-foundation.md`) діють повністю.

## Global Constraints

- Усе з Global Constraints фази 1 (версії, мови, тема, CSP, бюджети Lighthouse: a11y/BP/SEO ≥ 95, performance ≥ 92, LCP < 2,5 с, CLS < 0.1, TBT < 400 мс; axe — 0 порушень у обох темах).
- Документація Next — лише `node_modules/next/dist/docs/`.
- Без пояснювальних приміток про роботу сайту й методику; без підписів джерел під блоками; без плашок автора на фото — автори й ліцензії лише у згорнутих переліках внизу сторінки.
- Без логотипів F1 і команд: команда = назва + квадрат/смуга кольору; фото — лише вільні ліцензії з Commons (`car_pick.json`, поле `lic`).
- Пілоти в картках — аватар-кружок (немає вільного фото → ініціали) + прізвище.
- Очки й лічильники — цілі числа; числа на сторінці беруться лише зі знімка (жодних чисел у коді чи словниках).
- Пагінація — по 24 («Показати ще N · лишилось M»), як у макеті.
- Назви команд не перекладаються; країни — з таблиці `CC` генератора (UK/EN).
- **Посилання на картки команд і пілотів поки не ставимо** (сторінок ще немає; посилання на 404 ламають prefetch і правило «без мертвих посилань»). Тимчасове відхилення від правила «у списках — посилання на картку»; повертаємо разом зі сторінками команди/пілота (фаза 3b). Позначити в `docs/decisions.md`.
- Нова залежність — лише після перевірки `hasInstallScript` і `npm audit` (план нових залежностей не потребує).
- **UX/UI без недоліків (вимога користувача 11.11):** кожна задача з інтерфейсом закінчується UX-проходом ДО рев'юера: скриншоти 320 / 390 / 768 / 1024 / 1280 / 1440 px у світлій і темній темі, проходження клавіатурою (порядок фокуса, видиме кільце), усі стани (hover, focus, active, pressed, порожньо, «показати ще», без JS), довгі назви й кирилиця; критика скілами `impeccable` і `web-design-guidelines`; кожну знахідку — виправити або записати в `docs/decisions.md`, чому ні. Знімки проходу — у scratchpad, не в репо.
- Після 3a — наступні сторінки фази 3 (картка команди, пілоти, траси, сезони, сезон, гонка, календар), кожна з окремим планом у `docs/plans/`.
- Гілка `phase3/teams-index` від `main`; у `main` — лише через PR із зеленим CI; автор комітів — Faust-11 (git config репо).

## Review Focus

1. **Посилання з параметрами й зміна мови:** `/uk/teams?q=lotus&f=win&sort=a` → після гідратації видно лише відповідні картки, елементи керування показують той самий стан; перемикач мови веде на `/teams?q=lotus&f=win&sort=a` з тим самим результатом — e2e у Task 4.
2. **Сміття в URL:** `?f=evil&sort=<script>&q=` + 300 символів → сторінка 200, фільтр/сортування за замовчуванням, нічого не відображається з query сирим — unit (Task 3) + e2e (Task 4).
3. **Пошук кирилицею й без діакритики:** «італія», «ІТАЛІЯ», «brabham», «ferr» знаходять те саме, що й у макеті; «Lotus» знаходить усі Lotus-записи — unit у Task 3.
4. **Без JS:** усі 164 картки видимі, кнопки фільтрів і «Показати ще» приховані (не мертві) — e2e у Task 4.
5. **Велика сторінка на слабкому телефоні:** 164 картки не роблять TBT/CLS гіршими за бюджет; фото поза першим екраном не вантажаться до прокрутки — Lighthouse і e2e у Task 4/5.

---

### Task 1: Шапка — жовтий лише для «Гри», підпис мови «UA»

**Files:**
- Modify: `src/components/site/site.css` (правила `.nav a:hover`, `.nav a[aria-current]`, `.is-accent`, `.mnav a…`), `src/components/site/lang-switch.tsx` (видимий код мови), `src/i18n/config.ts` (мапа видимих кодів)
- Test: `src/components/site/__tests__/lang-switch.test.tsx`, `e2e/shell.spec.ts`
- Docs: `docs/decisions.md` (рішення користувача 11.11)

**Interfaces:**
- Produces: `LOCALE_LABEL: Record<Locale, string>` = `{ en: "EN", uk: "UA" }` у `src/i18n/config.ts` (використовують шапка, мобільне меню, майбутні сторінки). `hreflang`, `lang`, префікс `/uk` — без змін.

Рішення користувача: «Гра» — заливна жовта плашка (`background: var(--yellow); color: var(--on-yellow)`); поточний розділ — жовте підкреслення (`box-shadow: inset 0 -2px 0 var(--yellow)`), колір тексту — `--head-fg`; hover — підкреслення кольору `--head-fg` без жовтого. У мобільній панелі — те саме (поточний — жовта стрілка/риска, «Гра» — плашка).

- [ ] **Step 1: unit** — `lang-switch.test.tsx`: видимий текст перемикача — «UA» і «EN»; у посилання на українську `hreflang="uk"`, `lang="uk"`, доступна назва «UA — Українська».
- [ ] **Step 2: e2e** (`shell.spec.ts`, 1280 px і мобільна панель): у «Гра» обчислений `background-color` = `--yellow`; у поточного розділу (`/uk/teams`) `color` ≠ `--yellow` і є жовтий `box-shadow`; після `hover()` на неактивному пункті `color` ≠ `--yellow`; axe — 0 у обох темах.
- [ ] **Step 3:** запустити — Expected: FAIL (зараз «UK» і жовтий текст).
- [ ] **Step 4:** реалізація; контраст плашки «Гра» (`--on-yellow` на `--yellow`) і підкреслення — перевірити `src/lib/contrast.ts` (текст ≥ 4.5:1, підкреслення ≥ 3:1 до фону шапки) unit-тестом.
- [ ] **Step 5:** `npm run lint && npm run typecheck && npm run test && npm run e2e` — Expected: усе зелене.
- [ ] **Step 6:** Commit `feat: шапка — жовта плашка «Гра», мова UA`.

### Task 2: Знімок даних команд і шар доступу

**Files:**
- Create: `scripts/snapshot/teams.py` (запуск: `python3 -I scripts/snapshot/teams.py ~/Desktop/F1/data`), `src/data/snapshot/teams.json`, `public/img/cars/<id>.jpg` (480×300), `public/img/drivers/<id>.jpg` (112×112), `src/lib/data/teams.ts`, `src/lib/data/types.ts`
- Delete: `public/e2e-probe.txt` (перевірку в `e2e/i18n.spec.ts` перевести на `/img/cars/ferrari.jpg` — рішення фази 1)
- Test: `src/lib/data/__tests__/teams-snapshot.test.ts`, `src/lib/data/__tests__/teams.test.ts`
- Docs: `docs/data/snapshot.md` (джерела, дата знімка, як оновити), `docs/audits/phase3a-data.md` (звірка з Jolpica)

**Interfaces:**
- Produces (`src/lib/data/types.ts`):
  ```ts
  type L10n = { en: string; uk: string };
  type Credit = { page: string; author: string; license: string };
  type TeamSnapshot = {
    id: string;              // slug назви: "mclaren", "red-bull", "alfa-romeo"
    name: string;            // коротка назва як у макеті (TSHORT): "Racing Bulls", "Haas"
    country: L10n;           // з CC генератора
    seasons: [number, number][]; // діапазони років участі (team_years.json)
    grandsPrix: number; wins: number; titles: number;
    current: null | { position: number; color: string; drivers: { id: string; name: L10n; initials: string; avatar: string | null }[] };
    photo: null | { src: string; width: 480; height: 300; credit: Credit };
  };
  type TeamsSnapshot = { asOf: string /* ISO дата останньої гонки знімка */; teams: TeamSnapshot[]; avatarCredits: Record<string, Credit> };
  ```
- Produces (`src/lib/data/teams.ts`): `getTeamsIndex(locale: Locale): Promise<TeamCard[]>`, де `TeamCard` — `TeamSnapshot` з розгорнутими під мову `country: string`, `drivers[].name: string` (прізвище), `photo.alt: string` (`"Болід {name}"` / `"{name} car"`) і полем пошуку `search: string`; `getTeamsCredits(): { cars: (Credit & { team: string })[]; avatars: (Credit & { driver: string })[] }` (лише фото, що реально показуються); `TEAMS_PAGE_SIZE = 24`. Реалізація у фазі 2 змінюється, сигнатури — ні.

Скрипт повторює логіку `build_teams.py` (джерела: `index_mockup/index_data.json`, `teams_cards/data/team_years.json`, `teams_cards/data/car_pick.json` + `ART_FIX`, `avatars.json` без `wide`, `newbie_mockup/saopaulo2026_results.json` для складу 2026, `UKN` — через `ast.literal_eval`, не `eval`), копіює фото з `teams_cards/img/c/` і робить кроп аватарів 112×112 так само, як генератор. Порядок команд у JSON — як у макеті (перемоги ↓, Гран-прі ↓).

- [ ] **Step 1: тест знімка** (`teams-snapshot.test.ts`): 164 команди; `id` унікальні й `/^[a-z0-9-]+$/`; 131 з `photo`, файл кожного `photo.src` існує в `public/`; 11 з `current`, позиції — рівно 1..11, кольори `/^#[0-9A-F]{6}$/i`; у кожного `current.drivers` 2 пілоти, всього 22; кожен `avatar` існує як файл і має запис в `avatarCredits`; ліцензії лише з переліку `["CC0","Public domain","CC BY 2.0","CC BY 2.5","CC BY 3.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 2.0 de","CC BY-SA 2.5","CC BY-SA 3.0","CC BY-SA 3.0 de","CC BY-SA 4.0"]` (замір 11.11: це всі 12 значень у `car_pick.json`; аватари — перевірити тим самим переліком, нове значення — лише свідомим доповненням тесту); `seasons` у межах 1950–2026, без перетинів, відсортовані; `wins ≤ grandsPrix`; `titles > 0` лише якщо остання участь ≥ 1958.
- [ ] **Step 2: тест шару** (`teams.test.ts`): `getTeamsIndex('uk')` — McLaren: `country === "Велика Британія"`, `photo.alt === "Болід McLaren"`; `getTeamsIndex('en')` — `"United Kingdom"`, `"McLaren car"`; пілоти — прізвища мовою сторінки; `search` містить назву, країну обома мовами й код країни в нижньому регістрі.
- [ ] **Step 3:** запустити — Expected: FAIL (модулів і файлів немає).
- [ ] **Step 4:** скрипт → `teams.json` + фото; `teams.ts`/`types.ts` (JSON імпортується статично — потрапляє лише в серверний код сторінки).
- [ ] **Step 5:** `npm run test` — Expected: PASS. Розмір: `teams.json` і `public/img` (зафіксувати в `docs/data/snapshot.md`; очікування — фото ≈ 4,2 МБ, гіпотеза).
- [ ] **Step 6: звірка з першоджерелом (замір):** для Ferrari, McLaren, Williams, Lotus, Brabham, Mercedes, Cadillac — `grandsPrix`, `wins`, `titles`, перший/останній рік порівняти з Jolpica API (`/ergast/f1/constructors/<id>/results`, `/constructorstandings/1`) з урахуванням злиття «шасі-двигун»; розбіжності — пояснити або виправити; результат — `docs/audits/phase3a-data.md` (факт/гіпотеза окремо).
- [ ] **Step 7:** Commit `feat: знімок даних команд і шар доступу`.

### Task 3: Логіка списку (пошук, фільтр, сортування, URL)

**Files:**
- Create: `src/lib/teams-list.ts`, `src/lib/season-strip.ts`
- Test: `src/lib/__tests__/teams-list.test.ts`, `src/lib/__tests__/season-strip.test.ts`

**Interfaces:**
- Consumes: `TeamCard` (Task 2).
- Produces:
  - `type TeamsFilter = 'all' | 'cur' | 'ch' | 'win'`; `type TeamsSort = 'p' | 'w' | 'gp' | 't' | 'y1' | 'y0' | 'a'` (значення й порядок опцій — як у макеті; за замовчуванням `f=all`, `sort=p`).
  - `type TeamsQuery = { q: string; f: TeamsFilter; sort: TeamsSort }`; `parseTeamsQuery(params: URLSearchParams): TeamsQuery`; `teamsQueryString(query: TeamsQuery): string` (значення за замовчуванням не пишуться; порожній результат → `""`, інакше з `?`).
  - `selectTeams(cards: readonly TeamCard[], query: TeamsQuery, locale: Locale): TeamCard[]`.
  - `normalizeSearch(s: string): string` (нижній регістр, NFKD без діакритики, `ʼ'’` прибрати, пробіли стиснути).
  - `seasonStripGradient(ranges: readonly [number, number][], from = 1950, to = 2026): string` — один `linear-gradient(...)` на картку замість 77 елементів макета (164 × 77 = 12 628 вузлів DOM).

Ключі сортування — з `teams.js` макета (`p`: позиція 2026 ↑, потім перемоги ↓, Гран-прі ↓; без позиції = 99; `a` — `localeCompare` мовою сторінки). Фільтри: `cur` — є `current`, `ch` — `titles > 0`, `win` — `wins > 0`.

- [ ] **Step 1: тести** — `parseTeamsQuery(new URLSearchParams('f=evil&sort=%3Cscript%3E'))` → `{ q: '', f: 'all', sort: 'p' }`; `q` довше 100 символів обрізається до 100; `teamsQueryString({q:'',f:'all',sort:'p'}) === ''`; `teamsQueryString({q:'lotus',f:'win',sort:'a'}) === '?q=lotus&f=win&sort=a'`; round-trip parse∘string = identity на 20 комбінаціях; `selectTeams` на знімку: `sort=p` — перші 11 = позиції 1..11; `f=ch` — кількість = число команд з `titles>0` у знімку; `q:'ІТАЛІЯ'` ≡ `q:'італія'` ≡ `q:'italy'`; `q:'ferr'` містить Ferrari; `q:'zzz'` → `[]`; `normalizeSearch('Citroën’s') === 'citroens'`; `seasonStripGradient([[1950,1951]],1950,1953)` = точний рядок з двома «on» сегментами (0–50 %) і «off» (50–100 %); суміжні діапазони зливаються; порожній масив → лише «off».
- [ ] **Step 2:** FAIL → реалізація → PASS (`npm run test`).
- [ ] **Step 3:** Commit `feat: логіка списку команд`.

### Task 4: Сторінка «Команди»

**Files:**
- Modify: `src/app/[lang]/teams/page.tsx` (замість заготовки `sectionPage`), словники `en.json`/`uk.json` (ключ `teams`: заголовок, підписи фактів з формами множини, пошук і плейсхолдер, фільтри, сортування, «Нічого не знайдено.», «Показати ще {n} · лишилось {left}», «Пілоти 2026», переліки авторів), `next.config.ts` (`images`: `qualities: [75]`, `localPatterns: [{ pathname: '/img/**', search: '' }]`, `formats`), `scripts/lighthouse.mjs` (`PAGES` + `/teams`)
- Create: `src/components/teams/team-card.tsx` (server), `src/components/teams/teams-browser.tsx` (client), `src/components/teams/teams-intro.tsx`, `src/components/teams/page-credits.tsx`, `src/components/teams/teams.css`, `src/lib/plural.ts`
- Test: `src/lib/__tests__/plural.test.ts`, `src/components/teams/__tests__/teams-browser.test.tsx`, `e2e/teams.spec.ts`

**Interfaces:**
- Consumes: `getTeamsIndex`, `getTeamsCredits`, `TEAMS_PAGE_SIZE` (Task 2); `parseTeamsQuery`, `teamsQueryString`, `selectTeams`, `seasonStripGradient` (Task 3); `pageMetadata`, `requireLocale` (фаза 1).
- Produces: `plural(n: number, locale: Locale, forms: Partial<Record<Intl.LDMLPluralRule, string>>): string` (через `Intl.PluralRules`); `<TeamCard card={TeamCard} labels={…} preload?: boolean />`; `<TeamsBrowser cards={TeamCard[]} locale={Locale} labels={…} />`; `<PageCredits groups={{ title: string; items: { label: string; href: string; author: string; license: string }[] }[]} />` — згорнуті `<details>` на темній поверхні одразу над футером (атрибуція «у футері» без зміни спільного layout; знадобиться всім сторінкам з фото).

Розмітка й стилі — з макета (`circuits.css` + `teams.css`), без копій дизайн-токенів (лише змінні з `globals.css`). Сервер рендерить усі картки в порядку `sort=p`; `TeamsBrowser` після гідратації читає `useSearchParams` (у `Suspense`), ставить `hidden` за `selectTeams`/пагінацією й оновлює URL через `window.history.replaceState` (docs: `linking-and-navigating.md`, «Native History API»). Без JS (`html:not([data-js])`) приховані картки показуються, інструменти й «Показати ще» сховані. Фото — `next/image` з `sizes` за сіткою 4/3/2/1 колонки; перші 4 — `preload`, решта `loading="lazy"`. Пошук — `<input type="search">` з видимою або `aria-label` назвою; результат озвучується `role="status"` («Знайдено N» — підпис до даних, не примітка). Сторінка й далі статична (`○` у виводі `next build`).

- [ ] **Step 1: unit** — `plural(1,'uk',…)==='конструктор'`, `plural(3,'uk',…)==='конструктори'`, `plural(164,'uk',…)==='конструктори'`, `plural(11,'uk',…)==='конструкторів'`, `plural(1,'en',…)==='constructor'`; `teams-browser.test.tsx` на 30 фікстурних картках: спершу видно 24 і кнопка «Показати ще 6 · лишилось 6»; клік → 30, кнопка зникає; чип `win` → `aria-pressed`, видно лише з `wins>0`, URL `?f=win` (`replaceState` викликано); введення «zzz» → «Нічого не знайдено.» і `role=status` оновився.
- [ ] **Step 2: e2e** (`teams.spec.ts`, обидві мови): 200, `h1` «Команди»/«Teams», три факти = числа зі знімка (замір 11.11: 164 / 15 з Кубком / 38 з перемогами); видимих карток 24, у DOM — 164; перші 11 видимих мають мітку `2026 · P1…P11` у порядку; McLaren — смуга кольору `#FF8000`, «Пілоти 2026» з двома аватарами; картка без фото — код країни; «Показати ще» до кінця → 164 і кнопка зникає; Review Focus 1 (параметри + перемикач мови), 2 (сміття в URL → 200, стан за замовчуванням, у HTML немає `<script>` з query), 4 (без JS — 164 видимих, інструменти приховані); 320/390/1280 px — `scrollWidth <= innerWidth`; фото за межами першого екрана не завантажені до прокрутки (`naturalWidth === 0` або без запиту в мережі); у переліку авторів — кожна показана фотографія з автором і ліцензією; посилань на неіснуючі сторінки немає (кожне внутрішнє посилання сторінки → 200); axe — 0 у світлій і темній темі; 0 помилок консолі (зокрема CSP).
- [ ] **Step 3:** FAIL → реалізація → PASS (`npm run e2e`).
- [ ] **Step 4: замір ваги:** `next build` — сторінка `○` (статична); розмір HTML `/uk/teams` (gzip) і RSC-пейлоаду, число вузлів DOM — записати в `docs/audits/phase3a-quality.md`. Якщо Lighthouse (Task 5) не вкладається в бюджет через розмір — запасний варіант, уже вирішений: сервер рендерить перші 24 картки, решта — клієнтом із даних, а без JS під сіткою `<noscript>`-список усіх команд текстом.
- [ ] **Step 5:** `seo.spec.ts` — `/teams` і `/uk/teams` з `title`/`description` розділу; у HTML немає `noindex`-винятків (лишається noindex до запуску).
- [ ] **Step 6:** Commit `feat: сторінка «Команди» — картки, пошук, фільтри`.

### Task 5: Перевірка якості й PR

- [ ] **Step 1: дизайн:** скіл `impeccable` (критика `/uk/teams` проти макета, 1280 і 390 px, світла й темна тема) і `web-design-guidelines`; `dataviz` — смуга сезонів (легенда не потрібна, бо роки дублюються текстом; перевірити контраст «on»/«off» ≥ 3:1). Знахідки — виправити.
- [ ] **Step 2: зображення й швидкість:** `seo-images` (alt, розміри, формати) і `core-web-vitals`; на прев'ю Vercel перевірити, що `/_next/image` віддає WebP/AVIF і 200; ліміт Vercel Hobby на оптимізацію зображень — звірити з документацією Vercel (гіпотеза: 131 фото × кілька ширин уміщаються в безкоштовний ліміт; якщо ні — `unoptimized` + заздалегідь стиснені WebP, рішення в `docs/decisions.md`).
- [ ] **Step 3:** Lighthouse на CI (`/`, `/teams`, `/uk/teams`, 404) — Expected: пороги з Global Constraints.
- [ ] **Step 4:** `/code-review high` по гілці; підтверджені знахідки — виправити.
- [ ] **Step 5:** `verification-before-completion`; PR `phase3/teams-index` → `main`, CI зелений; e2e проти прев'ю Vercel (`BASE_URL=<прев'ю>`, команда — у пам'яті проєкту).
- [ ] **Step 6:** `docs/decisions.md` — рішення фази 3a (знімок у репо, тимчасово без посилань на картки, смуга градієнтом, атрибуція над футером, Task 1); пам'ять проєкту — «НАСТУПНА СЕСІЯ».
