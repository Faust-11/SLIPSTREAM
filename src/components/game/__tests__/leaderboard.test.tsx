import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import { storeKey } from "@/lib/game/store";

const account = vi.hoisted(() => ({ value: { status: "anon" } as Record<string, unknown> }));
vi.mock("@/components/auth/account-store", () => ({ useAccount: () => account.value }));
const sendLap = vi.hoisted(() => vi.fn());
vi.mock("../save-lap", () => ({ sendLap }));

import { Leaderboard } from "../leaderboard";

const L = uk.gamePage as never;
const row = (place: number, player: string, ticks: number, jump = false) => ({ place, player, ticks, jump, at: "2026-11-21T10:00:00Z" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Routes = { board?: unknown; boardStatus?: number; mine?: unknown };
function routes(r: Routes) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/game/leaderboard")) return json(r.board ?? { rows: [], total: 0 }, r.boardStatus ?? 200);
    if (url.startsWith("/api/game/laps")) return json({ signedIn: true, mine: r.mine ?? null });
    return json({}, 404);
  });
}
const view = (track: "lyman" | "port" = "lyman", refresh = 0) => render(<Leaderboard track={track} labels={L} locale="uk" refresh={refresh} />);

beforeEach(() => {
  account.value = { status: "anon" };
  sendLap.mockReset();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("Leaderboard", () => {
  it("топ траси: місця, нік, час, дата; фальстарт позначено; кількість гравців", async () => {
    routes({ board: { rows: [row(1, "Max", 3500), row(2, "Lando", 3600, true), row(2, "Oscar", 3600)], total: 37 } });
    view();
    const table = await screen.findByRole("table", { name: "Найкращі кола на трасі «Лиман»" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Max")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("0:29.167")).toBeInTheDocument();
    expect(within(rows[1]!).getByLabelText("фальстарт +1 с")).toBeInTheDocument();
    expect(within(rows[2]!).getAllByRole("cell")[0]).toHaveTextContent("2"); // однаковий час — однакове місце
    expect(screen.getByText("Гравців на трасі: 37")).toBeInTheDocument();
  });

  it("порожня траса — запрошення стати першим; збій — повідомлення", async () => {
    routes({});
    const { unmount } = view();
    expect(await screen.findByText("Ще ніхто не проїхав цією трасою. Будь першим!")).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();
    routes({ boardStatus: 503 });
    view();
    expect(await screen.findByText("Таблицю не вдалося завантажити. Спробуйте пізніше.")).toBeInTheDocument();
  });

  it("анонім: запрошення увійти (з поверненням у гру); свого кола не запитує", async () => {
    const spy = routes({ board: { rows: [row(1, "Max", 3500)], total: 1 } });
    view();
    expect(await screen.findByText("Увійдіть, щоб потрапити в таблицю лідерів")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Увійти" })).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fgame");
    expect(spy.mock.calls.some(([u]) => String(u).startsWith("/api/game/laps"))).toBe(false);
  });

  it("вкладки: інша траса запитується окремо; вибір траси грою повертає таблицю до неї", async () => {
    const spy = routes({ board: { rows: [row(1, "Max", 3500)], total: 1 } });
    const { rerender } = view("lyman");
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Порт" }));
    await waitFor(() => expect(spy.mock.calls.some(([u]) => String(u).includes("track=port"))).toBe(true));
    expect(screen.getByRole("button", { name: "Порт" })).toHaveAttribute("aria-pressed", "true");
    rerender(<Leaderboard track="plateau" labels={L} locale="uk" refresh={0} />);
    expect(screen.getByRole("button", { name: "Плато" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ввійшов: підсвічено свій рядок і місце; поза топ-10 — окремий рядок після пропуску", async () => {
    account.value = { status: "user", nick: "Max", profile: true };
    routes({ board: { rows: [row(1, "Lando", 3400), row(2, "Oscar", 3450)], total: 40 }, mine: { ticks: 4200, jump: false, place: 31 } });
    view();
    await screen.findByRole("table");
    await waitFor(() => expect(screen.getByText("Ваше місце: 31 · 0:35.000")).toBeInTheDocument());
    const you = document.querySelector("tr.is-you.is-gap")!;
    expect(you).toHaveTextContent("Max");
    expect(you).toHaveTextContent("31");
  });

  it("ввійшов з рекордом у браузері, а в таблиці його немає: кнопка «Надіслати мій рекорд» шле збережений ввід і оновлює таблицю", async () => {
    account.value = { status: "user", nick: "Max", profile: true };
    localStorage.setItem(storeKey("lyman"), JSON.stringify({ best: { inputs: "1.100", total: 3592 }, laps: [], sectors: null }));
    const spy = routes({ board: { rows: [], total: 0 }, mine: null });
    sendLap.mockResolvedValue({ kind: "saved", place: 1, ticks: 3592 });
    view();
    const btn = await screen.findByRole("button", { name: "Надіслати мій рекорд (0:29.933) у таблицю" });
    await userEvent.click(btn);
    expect(sendLap).toHaveBeenCalledWith("lyman", "1.100", false);
    expect(await screen.findByText("Збережено в таблиці лідерів · місце 1")).toBeInTheDocument();
    await waitFor(() => expect(spy.mock.calls.filter(([u]) => String(u).startsWith("/api/game/leaderboard")).length).toBeGreaterThan(1));
  });

  it("кнопки немає, коли рекорд у таблиці не гірший за браузерний", async () => {
    account.value = { status: "user", nick: "Max", profile: true };
    localStorage.setItem(storeKey("lyman"), JSON.stringify({ best: { inputs: "1.100", total: 3592 }, laps: [], sectors: null }));
    routes({ board: { rows: [row(1, "Max", 3500)], total: 1 }, mine: { ticks: 3500, jump: false, place: 1 } });
    view();
    await screen.findByText("Ваше місце: 1 · 0:29.167");
    expect(screen.queryByRole("button", { name: /Надіслати мій рекорд/ })).toBeNull();
  });
});
