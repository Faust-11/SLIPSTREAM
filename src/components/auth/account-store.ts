"use client";

import { useSyncExternalStore } from "react";

/**
 * Стан акаунта в браузері — один на всі острови (шапка, мобільне меню, профіль). Без Intl, без localStorage: джерело
 * істини — сервер (/api/session). Анонімний відвідувач (немає позначки outlap_in) мережі не чіпає.
 */
export type Account =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "unavailable" }
  | { status: "user"; nick: string | null; profile: boolean };

const SERVER: Account = { status: "anon" };
let state: Account = { status: "loading" };
let started = false;
/** Номер останнього запиту/локальної зміни: відповідь старішого /api/session не має перезаписувати новіший стан. */
let seq = 0;
const listeners = new Set<() => void>();

function set(next: Account) {
  state = next;
  for (const l of listeners) l();
}

function hasFlag(): boolean {
  return document.cookie.split("; ").includes("outlap_in=1");
}

/** Запитати сервер. Позначки немає — одразу «анонім», без запиту. Застарілу відповідь (її випередив новіший запит чи локальна зміна) ігноруємо. */
export async function refreshAccount(): Promise<void> {
  const mine = ++seq;
  if (!hasFlag()) return set({ status: "anon" });
  try {
    const res = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return mine === seq ? set({ status: "unavailable" }) : undefined;
    const body = (await res.json()) as { user: { nick: string | null; profile?: boolean } | null; unavailable?: boolean };
    if (mine !== seq) return;
    if (body.user) set({ status: "user", nick: body.user.nick, profile: body.user.profile !== false });
    else set({ status: body.unavailable ? "unavailable" : "anon" });
  } catch {
    if (mine === seq) set({ status: "unavailable" });
  }
}

/** Поточний стан поза React (форма входу після refreshAccount). */
export function getAccount(): Account {
  return state;
}

export function setAnonymous(): void {
  seq++;
  set({ status: "anon" });
}

export function setNick(nick: string): void {
  if (state.status !== "user") return;
  seq++;
  set({ ...state, nick, profile: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refreshAccount();
  }
  return () => listeners.delete(listener);
}

/** Сервер і перший клієнтський рендер — «анонім» (однакова розмітка, без розбіжності гідратації). */
export function useAccount(): Account {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
