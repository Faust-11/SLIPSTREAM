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
const listeners = new Set<() => void>();

function set(next: Account) {
  state = next;
  for (const l of listeners) l();
}

function hasFlag(): boolean {
  return document.cookie.split("; ").includes("outlap_in=1");
}

/** Запитати сервер. Позначки немає — одразу «анонім», без запиту. */
export async function refreshAccount(): Promise<void> {
  if (!hasFlag()) return set({ status: "anon" });
  try {
    const res = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return set({ status: "unavailable" });
    const body = (await res.json()) as { user: { nick: string | null; profile?: boolean } | null; unavailable?: boolean };
    if (body.user) set({ status: "user", nick: body.user.nick, profile: body.user.profile !== false });
    else set({ status: body.unavailable ? "unavailable" : "anon" });
  } catch {
    set({ status: "unavailable" });
  }
}

export function setAnonymous(): void {
  set({ status: "anon" });
}

export function setNick(nick: string): void {
  if (state.status === "user") set({ ...state, nick, profile: true });
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
