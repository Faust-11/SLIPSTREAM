# Аудит залежностей · фаза 1, Task 1 (10.11.2026)

Інструменти: `npm audit` (npm 11.8.0) і колектор `supply-chain-risk-auditor` 2.0.4 (Trail of Bits). Звіт колектора — у додатку без змін; нижче — висновки й дії. Аудит повторюється після Task 2 (тестові залежності).

## Висновок

- **Залежності продакшну (`next`, `react`, `react-dom`): відомих уразливостей немає** на зафіксованих версіях (`npm audit --omit=dev` — 0; колектор — 0 з 3).
- **Транзитивно — 1 пакет з advisory:** `minimatch` 10.2.6, GHSA-g3hv-75wg-m249 (moderate, DoS через glob-патерн). Пакет потрапляє лише в лінтер (`typescript-eslint` → `typescript-estree`, діапазон `^10.2.2`); виправлення є тільки в 11.0.1 (мажорна версія). Вхідні патерни — власні конфіги репозиторію, не дані користувача. Ризик прийнято; дія — оновити, коли `typescript-eslint` перейде на `minimatch@11`. Позначка `npm audit` «fix available» хибна: `npm audit fix --dry-run` нічого не змінює; `npm audit fix --force` не запускати.
- **Install-скриптів немає** в жодному з пакетів lock-файла (`hasInstallScript` — 0 із 427 пакетів: 11 прямих + 416 транзитивних), тому в `.npmrc` увімкнено `ignore-scripts=true`.
- Позначки «один публікатор» для `@types/*` описують модель DefinitelyTyped (публікує бот `types`), а не покинутість; на збірку не впливають.
- `Binary-Artifacts 0/10` для `next` / `eslint-config-next` — оцінка репозиторію vercel/next.js (у ньому є бінарні файли), не пакета.

## Вибір версій (замір, а не план)

| Пакет | План | Встановлено | Причина |
|---|---|---|---|
| `next`, `eslint-config-next` | 16.2.9 | **16.4.5** | next@16.2.9 — 20 advisory (5 critical, 6 high, 8 medium, 1 low), зокрема GHSA-673q-mjm6-r5xr (RCE у `use cache`, `>=16.0.0 <=16.4.0`, виправлено в 16.4.1); у гілці 16.2.x виправлень немає. 16.4.5 (03.11) закриває ще 7 moderate-advisory з діапазоном `<=16.4.4` (напр. GHSA-mfr8-8qww-v76h, GHSA-pc58-hwjq-p385; перелік — release notes v16.4.5); 16.4.6 (09.11) — лише багфікси, на момент аудиту віком 1 день. Також 16.2.9 тягнув уражені `postcss` ≤8.5.22 і `sharp` <0.35.5 (high) — у 16.4.5 `postcss` 8.5.23, `sharp` ^0.35.5. |
| `react`, `react-dom` | 19.2.x | 19.2.9 | остання в лінійці 19.2 (14.10). |
| `tailwindcss`, `@tailwindcss/postcss` | ^4 | **4.3.3** | 4.3.4+ (02.11) перейшли на ESM-only `magic-string@1`, що ламає збірку на Node <20.19 і 22.0–22.11 (vercel/next.js#101061; Next 16.4.6 сам закріплює 4.3.3). |
| `eslint` | ^9 | 9.39.5 | `eslint-plugin-react`/`jsx-a11y`/`import` не підтримують eslint 10 (peer `^9`). |
| `typescript` | ^5 | 5.9.3 | версія генератора; `typescript-eslint` допускає `<6.1.0`, перехід на 6.0 — окремим рішенням. |
| `@types/node` | ^20 | 22.20.5 | відповідає мінімальному Node проєкту (`^22.13 \|\| >=24`). |
| `@types/react(-dom)` | ^19 | 19.2.18 / 19.2.7 | відповідають React 19.2 (19.3.x — для React 19.3). |

Усі версії — точні (`save-exact=true` у `.npmrc`).

## Повторний аудит після Task 2 (тестові залежності)

- Прямих залежностей 22 (3 продакшн + 19 dev), транзитивних 516. **Advisory — 0 серед прямих**; транзитивно — той самий `minimatch` 10.2.6 (лише лінтер).
- Нові позначки — лише `Binary-Artifacts` репозиторіїв `vite` і `playwright` (бінарні файли в репо, не в пакеті) та «один публікатор» `@types/*` (бот DefinitelyTyped).
- Install-скрипт з'явився в одного пакета: `fsevents` 2.3.3 (опційна залежність `vite`, лише macOS, `node-gyp rebuild` як запасний шлях). Пакет містить готовий бінарник; Vitest і Playwright з `ignore-scripts=true` працюють (перевірено запуском). На Linux (CI) пакет не встановлюється.
- `playwright-core` закріплено явно (1.64.1): peer `>=1.0.0` у `@axe-core/playwright` інакше тягне другу, новішу копію, що ламає типи.

| Пакет | Версія | Примітка |
|---|---|---|
| `vitest` | 5.1.0 | найновіша віком ≥ 7 днів |
| `vite` | 8.3.5 | закріплено явно; має вбудований `resolve.tsconfigPaths` — `vite-tsconfig-paths` з плану не потрібен |
| `@vitejs/plugin-react` | 6.2.1 | 6.3.0 вийшла 09.11 |
| `jsdom` | **29.1.1** | 30.x вимагає Node `^22.22.2 \|\| ^24.15.0` — ширше за `engines` проєкту |
| `@testing-library/react` / `dom` / `jest-dom` / `user-event` | 16.3.3 / 10.4.2 / 7.0.1 / 14.6.8 | `jest-dom` і `user-event` додано до плану: матчери й реалістичні події клавіатури для тестів меню |
| `@playwright/test`, `playwright-core` | 1.64.1 | 1.65.0 вийшла 05.11 |
| `@axe-core/playwright` | 4.14.0 | axe-core ~4.14.0 |

---

## Додаток: звіт колектора після Task 2 (без змін)

# Supply Chain Risk Report — `slipstream`

**Scanned:** `/Users/manager/Desktop/F1/slipstream`  
**Commit:** `f111386cb6e1`  
**Manifests read:** `package.json`, `package-lock.json`  
**Scanned at:** 2026-11-10T21:55:53+00:00  
**Direct dependencies:** 22 (npm 22)

## Summary

- **No known advisory affects any of the 22 direct dependencies**, checked at the versions this project resolves.
- **1 transitive package carries known advisories** at the locked versions — see Transitive advisories.
- 8 of 22 dependencies carry at least one finding, 1 of which reaches production.
- Weakest coverage: **Publisher concentration**, established for 5 of 22; the Coverage section lists every criterion.

## Production dependencies

3 dependencies are declared as runtime dependencies and ship in the built artifact. Advisory status is given for every one, clean or not.

| Dependency | Version | Advisories | Other findings |
|---|---|---|---|
| `next` | 16.4.5 | none known | — |
| `react` | 19.2.9 | none known | — |
| `react-dom` | 19.2.9 | none known | — |

## Findings

### Build-time only

Declared as development dependencies. A compromise here reaches build and CI hosts rather than users of the shipped artifact.

| Dependency | Version | Weekly downloads | Findings |
|---|---|---|---|
| `@types/node` | 22.20.5 | 627,121,296/wk | single human publisher (types) of 1 listed |
| `@types/react` | 19.2.18 | 226,049,293/wk | single human publisher (types) of 1 listed |
| `@types/react-dom` | 19.2.7 | 191,430,013/wk | single human publisher (types) of 1 listed |

## Upstream repository and CI hygiene — OpenSSF Scorecard

These criteria describe each dependency's own repository, not the audited
project. Remediation, where any exists, is upstream.

### Reaches production

| Dependency | Version | Weekly downloads | Findings |
|---|---|---|---|
| `next` | 16.4.5 | 91,911,398/wk | Binary-Artifacts scores 0/10 (below 10) |

### Build-time only

Declared as development dependencies. A compromise here reaches build and CI hosts rather than users of the shipped artifact.

| Dependency | Version | Weekly downloads | Findings |
|---|---|---|---|
| `@playwright/test` | 1.64.1 | 120,602,104/wk | Binary-Artifacts scores 6/10 (below 10) |
| `eslint-config-next` | 16.4.5 | 47,656,161/wk | Binary-Artifacts scores 0/10 (below 10) |
| `playwright-core` | 1.64.1 | 184,415,152/wk | Binary-Artifacts scores 6/10 (below 10) |
| `vite` | 8.3.5 | 263,886,976/wk | Binary-Artifacts scores 1/10 (below 10) |

## Transitive advisories

1 package of the 516 registry-verified packages beyond the direct set (resolved by `package-lock.json`) carries known advisories at the locked versions. Only advisories were checked at this depth.

| Package | Version | Reaches | Advisories |
|---|---|---|---|
| `minimatch` (npm) | 10.2.6 | build-time only | GHSA-g3hv-75wg-m249 |

## Informational

Measured, not flagged.

- **CI token permissions**: median 0/10 across 19 scored dependencies; 11 score below 6. Not flagged — this measures whether CI workflows declare least-privilege tokens, which tracks project maturity rather than the likelihood of malicious code being published.
- **Changes reviewed by a second person**: median 9/10 across 19 scored dependencies; 7 score below 6. Not flagged — this measures the share of recent commits reviewed by a second person, which is low for most small single-maintainer projects and largely restates publisher concentration.
- **Publish provenance**: 17 of 22 publish with build provenance.
  Without: `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`
- **Security policy published**: 16 of 22 publish a security policy.
  Without: `@tailwindcss/postcss`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `tailwindcss`
- **Download volume**: established for 22 of 22; median 176,263,686/week. Lowest: `@axe-core/playwright` (23,044,700/wk), `eslint-config-next` (47,656,161/wk), `@tailwindcss/postcss` (60,572,503/wk).

## Coverage

What was and was not measured, per criterion.

| Criterion | Tier | Assessed | Flagged | Not assessable |
|---|---|---|---|---|
| Known advisories | A | 22/22 | 0 | 0 |
| Deprecated or yanked | A | 22/22 | 0 | 0 |
| Repository archived | A | 22/22 | 0 | 0 |
| Maintenance activity | A | 22/22 | 0 | 0 |
| Publisher concentration | B | 5/22 | 3 | 17 |
| Install-time script execution | B | 22/22 | 0 | 0 |
| Dangerous CI workflow | scorecard | 19/22 | 0 | 3 |
| CI token permissions | scorecard | 19/22 | 0 | 3 |
| Checked-in binaries | scorecard | 19/22 | 5 | 3 |
| Changes reviewed by a second person | scorecard | 19/22 | 0 | 3 |
| Publish provenance | info | 22/22 | 0 | 0 |
| Security policy published | info | 22/22 | 0 | 0 |
| Download volume | info | 22/22 | 0 | 0 |

## Not assessable

**Checked-in binaries**

- 3 dependencies — OpenSSF Scorecard has no report for this repository: `react`, `react-dom`, `vitest`

**Changes reviewed by a second person**

- 3 dependencies — OpenSSF Scorecard has no report for this repository: `react`, `react-dom`, `vitest`

**Dangerous CI workflow**

- 3 dependencies — OpenSSF Scorecard has no report for this repository: `react`, `react-dom`, `vitest`

**Publisher concentration**

- 17 dependencies — publishes from CI with provenance, so the effective publisher set is whoever can merge to the release branch — not externally observable: `@axe-core/playwright`, `@playwright/test`, `@tailwindcss/postcss`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react` and 11 more

**CI token permissions**

- 3 dependencies — OpenSSF Scorecard has no report for this repository: `react`, `react-dom`, `vitest`

## Method and caveats

- Repository-level criteria (archived, maintenance activity, security policy, and the Scorecard checks) describe the source repository rather than the package. 22 dependencies resolve to 16 distinct repositories, so one repository can appear as several findings. Shared: github.com/DefinitelyTyped/DefinitelyTyped, github.com/microsoft/playwright, github.com/react/react, github.com/tailwindlabs/tailwindcss, github.com/vercel/next.js
- Optional tooling detected: npm. Not installed, so not used: bundler-audit, cargo-audit, osv-scanner, pip-audit.
- Every criterion except advisories applies to direct dependencies only. The 516 registry-verified packages resolved by package-lock.json were checked for known advisories at their locked versions, and for nothing else.
- HTTP sources: 50 fetched, 103 served from cache (oldest 0.3h old), 0 refetched as stale, 0 unavailable offline, 0 errors.
