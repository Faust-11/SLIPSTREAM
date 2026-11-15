/**
 * Ключ пошуку: нижній регістр; діакритику знімаємо лише в латиниці (Hülkenberg → hulkenberg), кирилицю лишаємо як є:
 * NFKD перетворив би «й» на «и» і «ї» на «і» — запит «й» знаходив 201 рядок з 836 (рев'ю PR #47).
 */
export const normKey = (s: string) =>
  s.toLowerCase().replace(/\p{Script=Latin}/gu, (ch) => ch.normalize("NFKD").replace(/\p{M}/gu, ""));
