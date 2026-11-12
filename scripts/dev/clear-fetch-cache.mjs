// Перед збіркою — без збережених відповідей бази з попередніх збірок.
// Next кладе відповіді fetch під час `next build` у .next/cache/fetch-cache і бере їх наступної збірки
// (замір 12.11: нова команда ats-italy з бази не потрапила в збірку, бо team_totals взято з кешу).
// Vercel відновлює .next/cache між збірками — без цього перезбірка після синхронізації показала б старі числа.
import { rmSync } from "node:fs";

rmSync(new URL("../../.next/cache/fetch-cache", import.meta.url), { recursive: true, force: true });
