import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamCard } from "@/lib/data/teams";
import { TeamsBrowser, type TeamsBrowserLabels } from "../teams-browser";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

const cards: TeamCard[] = Array.from({ length: 30 }, (_, i) => ({
  id: `t${i}`,
  name: `Team ${String(i).padStart(2, "0")}`,
  country: i % 2 ? "Італія" : "Велика Британія",
  countryCode: i % 2 ? "ITA" : "GBR",
  seasons: [[1950 + i, 1960 + i]],
  grandsPrix: 100 - i,
  wins: i < 5 ? 10 - i : 0,
  titles: i < 2 ? 1 : 0,
  current: i < 3 ? { position: i + 1, color: "#FF8000", drivers: [] } : null,
  photo: null,
  search: `team ${i} ${i % 2 ? "italy італія" : "united kingdom велика британія"}`,
}));

const labels: TeamsBrowserLabels = {
  card: { stats: { grandsPrix: "Гран-прі", wins: "Перемоги", titles: "Кубки" }, seasons: "Сезони", position: "{year} · P{pos}", positionLabel: "Сезон {year}: місце {pos}", drivers: "Пілоти {year}" },
  search: "Пошук команди",
  searchPlaceholder: "Lotus, Італія…",
  filtersLabel: "Показати",
  filters: { all: "Усі", cur: "Сезон {year}", ch: "Володарі Кубка", win: "Переможці гонок" },
  sortLabel: "Сортувати",
  sorts: { p: "спершу сезон {year}", w: "за перемогами", gp: "за Гран-прі", t: "за Кубками", y1: "нещодавні", y0: "найстаріші", a: "А–Я" },
  empty: "Нічого не знайдено.",
  emptyQuery: "Нічого не знайдено за запитом «{q}».",
  reset: "Скинути пошук і фільтр",
  more: "Показати ще {n} з {left}",
  found: { one: "Знайдено {n} команду", few: "Знайдено {n} команди", many: "Знайдено {n} команд", other: "Знайдено {n} команди" },
};

function setup(qs = "") {
  search = qs;
  render(<TeamsBrowser cards={cards} locale="uk" season={2026} pageSize={24} labels={labels} />);
  return userEvent.setup();
}
const visible = () => screen.queryAllByRole("article");
let replace: ReturnType<typeof vi.spyOn>;

describe("TeamsBrowser", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/uk/teams");
    // Шпигун — у кожному тесті: конфіг Vitest відновлює моки між тестами.
    replace = vi.spyOn(window.history, "replaceState");
  });

  it("спершу 24 картки й «Показати ще 6 з 6»; клік — усі 30, кнопки немає, фокус на 25-й картці", async () => {
    const user = setup();
    expect(visible()).toHaveLength(24);
    await user.click(screen.getByRole("button", { name: "Показати ще 6 з 6" }));
    expect(visible()).toHaveLength(30);
    expect(screen.queryByRole("button", { name: /Показати ще/ })).toBeNull();
    expect(document.activeElement).toBe(visible()[24]);
  });

  it("чип «Переможці гонок»: aria-pressed, лише з перемогами, URL ?f=win через replaceState", async () => {
    const user = setup();
    const chip = screen.getByRole("button", { name: "Переможці гонок" });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Усі" })).toHaveAttribute("aria-pressed", "false");
    expect(visible()).toHaveLength(5);
    expect(replace).toHaveBeenLastCalledWith(null, "", "/uk/teams?f=win");
    expect(screen.getByRole("status")).toHaveTextContent(/^Знайдено 5 команд$/);
  });

  it("підписи з роком сезону; спершу команди сезону за позицією", () => {
    setup();
    expect(screen.getByRole("button", { name: "Сезон 2026" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "спершу сезон 2026" })).toBeInTheDocument();
    expect(within(visible()[0]!).getByText("2026 · P1")).toBeInTheDocument();
    expect(within(visible()[2]!).getByText("2026 · P3")).toBeInTheDocument();
  });

  it("пошук без результатів → порожній стан; «Скинути» повертає все й фокус у пошук", async () => {
    const user = setup();
    const input = screen.getByRole("searchbox", { name: "Пошук команди" });
    await user.type(input, "zzz");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("Нічого не знайдено за запитом «zzz».")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Знайдено 0 команд$/);
    expect(replace).toHaveBeenLastCalledWith(null, "", "/uk/teams?q=zzz");
    await user.click(screen.getByRole("button", { name: "Скинути пошук і фільтр" }));
    expect(visible()).toHaveLength(24);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(replace).toHaveBeenLastCalledWith(null, "", "/uk/teams");
  });

  it("стан з URL: ?q=італія&sort=a — поле, сортування й результат відповідають", () => {
    setup("q=%D1%96%D1%82%D0%B0%D0%BB%D1%96%D1%8F&sort=a");
    expect(screen.getByRole("searchbox")).toHaveValue("італія");
    expect(screen.getByRole("combobox", { name: "Сортувати" })).toHaveValue("a");
    const names = visible().map((a) => within(a).getByRole("heading").textContent);
    expect(names).toHaveLength(15);
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!, "uk")));
  });

  it("сміття в URL → стан за замовчуванням, URL очищується", async () => {
    setup("f=evil&sort=%3Cscript%3E");
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Усі" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox")).toHaveValue("p");
    expect(visible()).toHaveLength(24);
  });

  it("пробіл у кінці пошуку — та сама вибірка: «Показати ще» не скидається (code-review PR #18)", async () => {
    const user = setup();
    const box = screen.getByRole("searchbox", { name: "Пошук команди" });
    await user.type(box, "team");
    await user.click(screen.getByRole("button", { name: /Показати ще/ }));
    expect(visible()).toHaveLength(30);
    await user.type(box, " ");
    expect(box).toHaveValue("team ");
    expect(visible()).toHaveLength(30);
  });

  it("зміна фільтра скидає пагінацію до 24; повторне натискання активного чипа — ні", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Показати ще/ }));
    expect(visible()).toHaveLength(30);
    await user.click(screen.getByRole("button", { name: "Усі" }));
    expect(visible()).toHaveLength(30);
    await user.click(screen.getByRole("button", { name: "Переможці гонок" }));
    await user.click(screen.getByRole("button", { name: "Усі" }));
    expect(visible()).toHaveLength(24);
  });
});
