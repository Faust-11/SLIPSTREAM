"use client";

import type { ReactNode } from "react";
import { useNow } from "@/components/calendar/clock";

/**
 * Оболонка картки-«квитка» етапу: лише ставить `data-state` (open / soon / closed / unknown) за годинником браузера — від
 * нього залежить колір квитка й штамп «Прогнози закрито» (CSS). Вміст рендерить сервер і передає сюди як children; до
 * гідратації стан порожній (квиток виглядає відкритим), крім етапу без часу — він «unknown» одразу. Це лише показ:
 * справжній дедлайн тримає база (як у RoundStatus).
 */
export function RoundTicket({ deadlineAt, children }: { deadlineAt: string | null; children: ReactNode }) {
  const now = useNow();
  let state: "open" | "soon" | "closed" | "unknown" | "" = "";
  if (deadlineAt === null) state = "unknown";
  else if (now !== null) {
    const left = Date.parse(deadlineAt) - now;
    state = left <= 0 ? "closed" : left < 24 * 3_600_000 ? "soon" : "open";
  }
  return (
    <li className="pd-round" data-state={state}>
      {children}
    </li>
  );
}
