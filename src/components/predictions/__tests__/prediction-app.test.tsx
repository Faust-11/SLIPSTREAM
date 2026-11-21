import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import type { PickDriver, PickTeam } from "@/lib/data/predictions";
import { PredictionApp } from "../prediction-app";
import type { NickText } from "@/components/auth/nick-form";
import type { PredictionsText, RoundApi } from "../types";

/**
 * useNow сайту (calendar/clock.ts) тримає стан на рівні модуля (знімок і таймер), який у наборі тестів із різним фейковим часом
 * «протікає» між тестами. Тут — та сама поведінка (час із кроком 30 с, null до монтування) без спільного стану.
 */
vi.mock("@/components/calendar/clock", async () => {
  const react = await import("react");
  const actual = await vi.importActual<typeof import("@/components/calendar/clock")>("@/components/calendar/clock");
  const step = () => Math.floor(Date.now() / 30_000) * 30_000;
  return {
    ...actual,
    useNow: () => {
      const [now, setNow] = react.useState<number>(step);
      react.useEffect(() => {
        const id = setInterval(() => setNow(step()), 1000);
        return () => clearInterval(id);
      }, []);
      return now;
    },
  };
});

const text = uk.predictions as unknown as PredictionsText;
const t = text.round;
const nickText = uk.auth.nick as unknown as NickText;
const driver = (id: number, short: string, position: number): PickDriver => ({ id, short, name: short, code: short.slice(0, 3).toUpperCase(), number: id, team: "mercedes", teamName: "Mercedes", color: "#27D9C2", position });
const drivers = [driver(1, "Антонеллі", 1), driver(2, "Ферстаппен", 2), driver(3, "Расселл", 3)];
const teams: PickTeam[] = [{ id: 191, slug: "red-bull", name: "Red Bull", color: "#1B2B6B" }];
const ten = (...first: (number | null)[]) => [...first, ...Array(10 - first.length).fill(null)] as (number | null)[];
const T0 = new Date("2026-11-27T12:00:00Z").getTime();

/** Стан етапу, який «віддає сервер»; тест міняє `current` між запитами. */
let current: () => RoundApi;
const base = (over: Partial<RoundApi> = {}): RoundApi => ({
  now: Date.now(),
  deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  closed: false,
  signedIn: true,
  user: { nick: "Max", publicName: "Max" },
  mine: { Q: null, R: null },
  revealed: null,
  unavailable: false,
  ...over,
});
let fetches: string[];

function mount(deadlineAt: string | null = null) {
  return render(
    <PredictionApp text={text} nickText={nickText} locale="uk" year={2026} round={22} deadlineAt={deadlineAt} drivers={drivers} teams={teams} loginHref="/uk/login" selfHref="/uk/predictions/22" />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(T0);
  fetches = [];
  current = () => base();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    fetches.push(String(input));
    return new Response(JSON.stringify(current()), { status: 200 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
/** Крутимо фейковий час малими кроками, доки не виконається умова (ланцюг «відповідь → рендер → ефект → таймер» — кілька мікрозадач). */
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await flush(25);
};

describe("стан входу (рев'ю 21.11, D)", () => {
  it("не ввійшов — картка входу з безпечним ?next=", async () => {
    current = () => base({ signedIn: false, user: null });
    mount();
    const link = await screen.findByRole("link", { name: t.signIn.cta });
    expect(link).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fpredictions%2F22");
  });

  it("ввійшов, але збій бази зачепив профіль (user=null, unavailable) — картки входу НЕМАЄ (інакше петля з /login), є «недоступно»", async () => {
    current = () => base({ signedIn: true, user: null, unavailable: true, mine: null });
    mount();
    expect(await screen.findByText(t.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.signIn.cta })).toBeNull();
    expect(screen.queryByRole("heading", { name: t.signIn.h })).toBeNull();
  });

  it("збій входу (сесію оновити не вдалося, signedIn=false, unavailable) — теж без картки входу: unknown ≠ «не ввійшов»", async () => {
    current = () => base({ signedIn: false, user: null, unavailable: true, mine: null });
    mount();
    expect(await screen.findByText(t.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.signIn.cta })).toBeNull();
  });
});

describe("режим «лише перегляд»", () => {
  const closed = (over: Partial<RoundApi> = {}) =>
    base({ closed: true, deadline: new Date(T0 - 3600_000).toISOString(), ...over });
  const row = (player: string, kind: "Q" | "R" = "Q") => ({ kind, player, picks: ten(1, 2, 3), dnfTeam: null, allFinish: false, points: null });

  it("(G) підсвітка «ви» — за публічним ім'ям (у прихованого нік ≠ ім'я в таблиці)", async () => {
    current = () => closed({ user: { nick: "Max", publicName: "Гравець AB12" }, revealed: [row("Гравець AB12"), row("Other")] });
    mount();
    const mine = await screen.findByRole("row", { name: /Гравець AB12/ });
    expect(mine).toHaveTextContent(`(${t.revealed.you})`);
    expect(screen.getByRole("row", { name: /Other/ })).not.toHaveTextContent(`(${t.revealed.you})`);
  });

  it("порожній список (revealed=[]) — «ніхто не зробив прогноз»; null (збій) — не вигадуємо порожню таблицю", async () => {
    current = () => closed({ revealed: [] });
    const first = mount();
    expect(await screen.findByText(t.revealed.none)).toBeInTheDocument();
    first.unmount();
    current = () => closed({ revealed: null, unavailable: true });
    mount();
    expect(await screen.findByText(t.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(t.revealed.none)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("(E) мій збережений пілот/команда, яких уже немає на сітці, — осмислена підпис замість «?»", async () => {
    current = () =>
      closed({ mine: { Q: null, R: { picks: ten(1, 2, 999), dnfTeam: 555, allFinish: false, updatedAt: null } }, revealed: [] });
    mount();
    expect(await screen.findByText(t.gone)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.goneTeam))).toBeInTheDocument();
    expect(screen.queryByText(t.revealed.unknown)).toBeNull();
  });

  it("перший кадр уже «закрито» — фокус не краде", async () => {
    current = () => closed({ revealed: [] });
    mount();
    await screen.findByText(t.revealed.none);
    expect(document.body).toHaveFocus();
  });
});

describe("годинник: клієнт каже «закрито», сервер — ще ні (рев'ю 21.11, I)", () => {
  /** Дедлайн на 2 хв раніше за «зараз» — кроки годинника сайту (30 с) його вже минули. */
  const lagging = () => base({ closed: false, deadline: new Date(Date.now() - 120_000).toISOString() });

  it("перечитує стан одразу, потім ще двічі з паузою (2 с, 5 с), і зупиняється — не вічний цикл запитів", async () => {
    current = lagging;
    mount();
    const count = () => fetches.filter((u) => u.startsWith("/api/predictions")).length;
    await until(() => count() >= 2);
    expect(count()).toBe(2); // перше завантаження + негайний перечит
    await flush(2100);
    await until(() => count() >= 3);
    expect(count()).toBe(3);
    await flush(5100);
    await until(() => count() >= 4);
    expect(count()).toBe(4);
    await flush(60_000);
    expect(count()).toBe(4); // зупинились
  });

  it("щойно сервер підтверджує «закрито» — повтори припиняються, з'являються чужі прогнози", async () => {
    let calls = 0;
    const other = { kind: "Q" as const, player: "Other", picks: ten(1, 2, 3), dnfTeam: null, allFinish: false, points: null };
    current = () => (++calls >= 3 ? base({ closed: true, deadline: new Date(Date.now() - 120_000).toISOString(), revealed: [other] }) : lagging());
    mount();
    await until(() => fetches.length >= 2);
    await flush(2100);
    await until(() => calls >= 3);
    expect(await screen.findByRole("row", { name: /Other/ })).toBeInTheDocument(); // чужі прогнози справді підтягнулись
    const after = fetches.length;
    await flush(60_000);
    expect(fetches.length).toBe(after);
  });

  it("перехід відкрито → закрито переносить фокус на блок стану (форма розмонтовується разом з фокусом)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const deadline = new Date(T0 + 45_000).toISOString();
    current = () => (Date.now() >= T0 + 45_000 ? base({ closed: true, deadline, revealed: [] }) : base({ deadline }));
    mount();
    const select = await screen.findAllByLabelText(/^Місце 1(\D|$)/);
    await user.click(select[0]!);
    expect(select[0]).toHaveFocus();
    await flush(90_000); // відлік (крок 30 с) доходить до нуля → перечит → «закрито»
    const region = await screen.findByRole("region", { name: t.deadlineLabel });
    await waitFor(() => expect(region).toHaveFocus());
    expect(within(document.body).queryAllByLabelText(/^Місце 1(\D|$)/)).toHaveLength(0);
  });
});
