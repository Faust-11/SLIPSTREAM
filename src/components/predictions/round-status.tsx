"use client";

import Link from "next/link";
import { useAccount } from "@/components/auth/account-store";
import { useHydrated, useNow } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { countdown } from "@/lib/play/countdown";
import type { PredictionsText } from "./types";

/**
 * Статус етапу в списку: «Прогнози відкриті · закриються через 5 дн. 3 год» / «Прогнози закрито». Лише після гідратації
 * (на сервері й у статичному HTML часу немає — сторінка будується заздалегідь), з кроком 30 с (calendar/clock.ts). Рядок
 * зарезервовано за висотою, тож поява тексту не зсуває картку. Це лише показ: справжній дедлайн тримає база.
 */
export function RoundStatus({ deadlineAt, locale, text }: { deadlineAt: string | null; locale: Locale; text: PredictionsText }) {
  const now = useNow();
  let label = "";
  let state: "open" | "soon" | "closed" | "unknown" | "" = "";
  if (deadlineAt === null) {
    label = text.noTime;
    state = "unknown";
  } else if (now !== null) {
    const left = Date.parse(deadlineAt) - now;
    if (left <= 0) {
      label = text.closed;
      state = "closed";
    } else {
      label = `${text.open} · ${fill(text.closesIn, { t: countdown(left, locale).text })}`;
      state = left < 24 * 3_600_000 ? "soon" : "open";
    }
  }
  return (
    <p className="pd-status" data-state={state}>
      {label}
    </p>
  );
}

/**
 * Кнопка етапу: «Зробити прогноз» → після дедлайну (за часом браузера) «Дивитися прогнози». До гідратації й без відомого
 * часу — «Зробити прогноз»: сторінка етапу сама покаже справжній стан (його віддає база).
 * Не ввійшов (після гідратації акаунт-стор каже «анонім»: позначки сесії в cookie немає) і етап відкритий — кнопка прямо
 * каже «Увійдіть, щоб зробити прогноз» і веде на вхід з поверненням на етап (відгук 21.11: «натискаю — нічого не відбувається»).
 * Ввійшов або сесія ще перевіряється — звичайна кнопка; без JS — посилання на етап, де пропозиція входу теж є.
 */
export function RoundAction({ deadlineAt, href, text, loginHref }: { deadlineAt: string | null; href: string; text: PredictionsText; loginHref: string }) {
  const now = useNow();
  const hydrated = useHydrated();
  const account = useAccount();
  const closed = deadlineAt === null || (now !== null && Date.parse(deadlineAt) <= now);
  if (!closed && hydrated && account.status === "anon") {
    return (
      <Link className="btn au-btn pd-signin-btn" href={`${loginHref}?next=${encodeURIComponent(href)}`} data-signin="">
        {text.round.signIn.h}
      </Link>
    );
  }
  return (
    <Link className={closed ? "btn btn-ghost au-btn" : "btn au-btn"} href={href}>
      {closed ? text.view : text.make}
    </Link>
  );
}
