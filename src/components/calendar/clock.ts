"use client";

import { useSyncExternalStore } from "react";

/** Підписка-заглушка для useSyncExternalStore: значення не змінюється після гідратації. */
export const noopSubscribe = () => () => {};

/** true після гідратації (на сервері й під час гідратації — false): без розбіжності розмітки й без setState в ефекті. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Поточний час з кроком TICK. Таймер вирівняно на межу кроку (setTimeout до наступного кратного, а не setInterval від
 * монтування — інакше відлік відставав до ~60 с, рев'ю PR #19); знімок кешовано між тіками — getSnapshot повертає те
 * саме значення в межах рендеру.
 */
export const TICK = 30_000;
const floorTick = () => Math.floor(Date.now() / TICK) * TICK;
let snap: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function arm() {
  // +20 мс — щоб спрацювати вже після межі (таймер браузера може прийти на мілісекунду раніше).
  timer = setTimeout(() => {
    snap = floorTick();
    listeners.forEach((l) => l());
    arm();
  }, TICK - (Date.now() % TICK) + 20);
}
function subscribeNow(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    snap = floorTick();
    arm();
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) clearTimeout(timer);
  };
}
const getNow = () => (snap ??= floorTick());

/** Час клієнта (мс, кратний TICK); на сервері й під час гідратації — null. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeNow, getNow, () => null);
}

/**
 * Стан етапів за часом клієнта: гонка стартувала — started, перша ще не стартована — next, решта — later.
 * Дані оновлюються пн/чт, а гонка — у нд: до оновлення збірка вважала б наступною вже стартовану.
 */
export function liveStates(raceAts: (string | null)[], now: number): ("started" | "next" | "later")[] {
  let nextGiven = false;
  return raceAts.map((at) => {
    if (at !== null && Date.parse(at) <= now) return "started";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "later";
  });
}

/** Залишок до моменту (мс) — дні, години, хвилини; від'ємне — нулі (відлік календаря й головної). */
export function timeLeft(ms: number): { d: number; h: number; m: number } {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
}

/**
 * Секундний годинник — лише для відліку на головній (там видно секунди). Окремий від 30-секундного: календар і решта
 * сторінок не перемальовуються щосекунди; підписники секундного знімка живуть, поки відлік змонтований.
 */
const SEC = 1000;
const floorSec = () => Math.floor(Date.now() / SEC) * SEC;
let secSnap: number | null = null;
const secListeners = new Set<() => void>();
let secTimer: ReturnType<typeof setTimeout> | undefined;
function armSec() {
  secTimer = setTimeout(() => {
    secSnap = floorSec();
    secListeners.forEach((l) => l());
    armSec();
  }, SEC - (Date.now() % SEC) + 20);
}
function subscribeSec(cb: () => void) {
  secListeners.add(cb);
  if (secListeners.size === 1) {
    secSnap = floorSec();
    armSec();
  }
  return () => {
    secListeners.delete(cb);
    if (secListeners.size === 0) clearTimeout(secTimer);
  };
}
const getSec = () => (secSnap ??= floorSec());

/** Час клієнта (мс, кратний секунді); на сервері й під час гідратації — null. */
export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribeSec, getSec, () => null);
}

/** Залишок до моменту (мс) — дні, години, хвилини, секунди; від'ємне — нулі. */
export function timeLeftSeconds(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
