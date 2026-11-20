/**
 * Адреси історій, прописані в КОДІ (головна сторінка, Lighthouse): їх не можна ні перейменувати, ні перетворити на чернетку — сторінка
 * зникла б, і CI (Lighthouse, e2e) упав би на 404. Тест (rename.test.ts) звіряє цей список із кодом через git grep.
 */
export const CODE_PINNED: Record<string, string> = {
  "suzuka-1989": "головна сторінка (src/app/[lang]/page.tsx)",
  "jerez-1997": "головна сторінка (src/app/[lang]/page.tsx)",
  "singapore-2008": "головна сторінка і перевірка Lighthouse (src/app/[lang]/page.tsx, scripts/lighthouse*.mjs)",
  "spygate-2007": "публічні автотести (e2e/stories.spec.ts)",
};

/**
 * Історії, на які спираються автотести адмінки (e2e/admin*.spec.ts читають справжні файли content/stories). Перейменування не блокуємо
 * (їх 14 з 33), але попереджаємо: CI такого PR впаде на тестах, доки їх не оновлено, і PR не зіллється сам.
 */
export const E2E_FIXTURES = [
  "abu-dhabi-2021", "austria-2002", "brawn-gp-2009", "button-canada-2011", "f1-points-history", "f1-team-size", "hamilton-brazil-2008", "how-f1-began",
  "hunt-lauda-1976", "imola-1994", "pit-stop-evolution", "schumacher-debut-1991", "spa-2021", "vettel-monza-2008", "women-in-f1",
] as const;

export const e2eWarning = (slug: string): string | null =>
  (E2E_FIXTURES as readonly string[]).includes(slug) ? `На історію «${slug}» спираються автотести адмінки (e2e/admin*.spec.ts): CI цього PR впаде, доки їх не оновлено, і він не зіллється сам.` : null;

/** Помилка, якщо закодовану історію намагаються зробити чернеткою; null — можна. */
export function pinnedDraftError(slug: string, status: unknown, pinned: Record<string, string> = CODE_PINNED): string | null {
  return status === "draft" && pinned[slug] ? `Історію «${slug}» не можна зробити чернеткою: її адреса прописана в коді — ${pinned[slug]}.` : null;
}
