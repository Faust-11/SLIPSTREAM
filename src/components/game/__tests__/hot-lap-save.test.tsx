import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import type { Result } from "../engine";

// Керований «рушій»: сторінка отримує знімки від тесту, без canvas і фізики (їх перевіряє engine.test.ts).
type Snap = Record<string, unknown>;
const hoisted = vi.hoisted(() => {
  const state: { snap: Record<string, unknown>; listeners: Set<() => void> } = { snap: {}, listeners: new Set() };
  return { state, account: { value: { status: "anon" } as Record<string, unknown> }, sendLap: vi.fn() };
});
vi.mock("../engine", () => ({
  HotLapEngine: class {
    subscribe = (cb: () => void) => {
      hoisted.state.listeners.add(cb);
      return () => hoisted.state.listeners.delete(cb);
    };
    getSnapshot = () => hoisted.state.snap;
    getServerSnapshot = () => hoisted.state.snap;
    setLabels() {}
    attach() {
      return () => {};
    }
    press() {}
    start() {}
    selectTrack() {}
    setGhost() {}
  },
}));
vi.mock("@/components/auth/account-store", () => ({ useAccount: () => hoisted.account.value, refreshAccount: vi.fn(), getAccount: () => hoisted.account.value }));
vi.mock("../save-lap", () => ({ sendLap: hoisted.sendLap }));
vi.mock("../leaderboard", async (orig) => {
  const real = await orig<typeof import("../leaderboard")>();
  return { ...real, Leaderboard: (p: { refresh: number }) => <div data-testid="board" data-refresh={p.refresh} /> };
});

import { HotLap } from "../hot-lap";

const L = uk.gamePage as never;
const cards = [{ key: "lyman", points: "0,0", start: [0, 0], length: "1,30 км", width: "14 м", bot: "0:29.933" }] as never;
const result: Result = { t: 3592, pen: 0, jump: false, isBest: true, prevBest: null, inputs: "1.3592" };
const snap = (over: Snap = {}): Snap => ({ key: "lyman", phase: "ready", result: null, laps: [], bestTotal: null, botTotal: 3592, preferBot: true, cardBests: { lyman: null, port: null, plateau: null, forest: null }, mounted: true, ...over });
const publish = (next: Snap) =>
  act(() => {
    hoisted.state.snap = next;
    hoisted.state.listeners.forEach((l) => l());
  });

beforeEach(() => {
  hoisted.state.snap = snap();
  hoisted.account.value = { status: "anon" };
  hoisted.sendLap.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("HotLap — вхід і таблиця лідерів", () => {
  it("анонім до старту: підказка «увійдіть, щоб потрапити в таблицю» з посиланням на вхід і поверненням у гру", () => {
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    const link = screen.getByRole("link", { name: "Увійти" });
    expect(link).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fgame");
    expect(screen.getByText(/Щоб ваше коло потрапило в таблицю лідерів, увійдіть/)).toBeInTheDocument();
    expect(hoisted.sendLap).not.toHaveBeenCalled();
  });

  it("анонім після кола: пояснення, що коло не в таблиці, і кнопка входу; на сервер нічого не йде", () => {
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    publish(snap({ phase: "done", result }));
    expect(screen.getByText(/Це коло не потрапило в таблицю лідерів: ви не ввійшли/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Увійти й змагатися" })).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fgame");
    expect(hoisted.sendLap).not.toHaveBeenCalled();
  });

  it("ввійшов: коло йде на сервер ОДИН раз (траса, ввід, ознака фальстарту), успіх показує місце й оновлює таблицю", async () => {
    hoisted.account.value = { status: "user", nick: "Max", profile: true };
    hoisted.sendLap.mockResolvedValue({ kind: "saved", place: 3, ticks: 3592 });
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    expect(screen.queryByRole("link", { name: "Увійти" })).toBeNull();
    publish(snap({ phase: "done", result: { ...result, jump: true } }));
    expect(screen.getByText("Зберігаємо коло в таблиці лідерів…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Збережено в таблиці лідерів · місце 3")).toBeInTheDocument());
    expect(hoisted.sendLap).toHaveBeenCalledTimes(1);
    expect(hoisted.sendLap).toHaveBeenCalledWith("lyman", "1.3592", true);
    expect(screen.getByTestId("board")).toHaveAttribute("data-refresh", "1");
    // Повторний знімок того самого результату (перемальовування) — не відправляє вдруге.
    publish(snap({ phase: "done", result: hoisted.state.snap.result }));
    expect(hoisted.sendLap).toHaveBeenCalledTimes(1);
  });

  it("не краще за рекорд у таблиці — показуємо його час і місце; таблицю не перезавантажуємо", async () => {
    hoisted.account.value = { status: "user", nick: "Max", profile: true };
    hoisted.sendLap.mockResolvedValue({ kind: "kept", place: 2, ticks: 3500 });
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    publish(snap({ phase: "done", result }));
    await waitFor(() => expect(screen.getByText("Не краще за ваш рекорд у таблиці (0:29.167) · місце 2")).toBeInTheDocument());
    expect(screen.getByTestId("board")).toHaveAttribute("data-refresh", "0");
  });

  it.each([
    ["noNick", /оберіть нік у профілі/],
    ["blocked", /не може потрапити в таблицю лідерів/],
    ["rate", /Забагато кіл/],
    ["invalid", /Сервер не прийняв це коло/],
    ["unavailable", /тимчасово недоступна\. Рекорд збережено в браузері/],
    ["session", /Сесія закінчилась/],
  ])("відмова %s — зрозумілий текст; «noNick» веде в профіль", async (reason, text) => {
    hoisted.account.value = { status: "user", nick: null, profile: false };
    hoisted.sendLap.mockResolvedValue({ kind: "error", reason });
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    publish(snap({ phase: "done", result }));
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    if (reason === "noNick") expect(screen.getByRole("link", { name: "Обрати нік" })).toHaveAttribute("href", "/uk/profile");
  });

  it("акаунт ще завантажується — нічого не відправляємо й не просимо увійти", () => {
    hoisted.account.value = { status: "loading" };
    render(<HotLap cards={cards} labels={L} locale="uk" />);
    publish(snap({ phase: "done", result }));
    expect(hoisted.sendLap).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Увійти/ })).toBeNull();
  });
});
