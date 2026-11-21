import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import { fill } from "@/i18n/fill";
import type { PickDriver, PickTeam } from "@/lib/data/predictions";
import { KindForm, errorOf } from "../kind-form";
import type { PredictionsText, SavedPrediction } from "../types";

const text = uk.predictions as unknown as PredictionsText;
const t = text.round;
const driver = (id: number, short: string, position: number): PickDriver => ({ id, short, name: short, code: short.slice(0, 3).toUpperCase(), number: id, team: "mercedes", teamName: "Mercedes", color: "#27D9C2", position });
const drivers = [driver(1, "Антонеллі", 1), driver(2, "Ферстаппен", 2), driver(3, "Расселл", 3), driver(4, "Гамілтон", 4)];
const teams: PickTeam[] = [{ id: 191, slug: "red-bull", name: "Red Bull", color: "#1B2B6B" }];
const ten = (...first: (number | null)[]) => [...first, ...Array(10 - first.length).fill(null)] as (number | null)[];
const saved = (picks: (number | null)[], over: Partial<SavedPrediction> = {}): SavedPrediction => ({ picks, dnfTeam: null, allFinish: false, updatedAt: null, ...over });

function form(kind: "Q" | "R", initial: SavedPrediction | null = null, handlers: Partial<{ onClosed: () => void; onNoProfile: () => void; onUnauthorized: () => void }> = {}) {
  return render(
    <KindForm kind={kind} year={2026} round={22} drivers={drivers} teams={teams} initial={initial} text={text} onClosed={handlers.onClosed ?? (() => {})} onNoProfile={handlers.onNoProfile ?? (() => {})} onUnauthorized={handlers.onUnauthorized ?? (() => {})} />,
  );
}
const slot = (n: number) => screen.getByLabelText(new RegExp(`^Місце ${n}(\\D|$)`)) as HTMLSelectElement;
const reply = (status: number, body: unknown = {}) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
const sentBody = (spy: ReturnType<typeof reply>) => JSON.parse(String(spy.mock.calls[0]![1]!.body));

afterEach(() => vi.restoreAllMocks());

describe("errorOf — відповідь сервера → текст помилки (рев'ю 21.11, H)", () => {
  it("409 — закрито; 401 — сесія; 429 — ліміт; 400 — перевірка", () => {
    expect(errorOf(409, undefined)).toBe("closed");
    expect(errorOf(401, undefined)).toBe("unauthorized");
    expect(errorOf(429, undefined)).toBe("rateLimited");
    expect(errorOf(400, "invalid")).toBe("invalid");
  });
  it("403: «заблоковано» лише для error=blocked; no_profile — окремо; будь-який інший 403 (напр. origin) — збій, а не «акаунт заблоковано»", () => {
    expect(errorOf(403, "blocked")).toBe("blocked");
    expect(errorOf(403, "no_profile")).toBe("noProfile");
    expect(errorOf(403, "origin")).toBe("unavailable");
    expect(errorOf(403, undefined)).toBe("unavailable");
  });
  it("5xx і збій мережі (0) — недоступно", () => {
    expect(errorOf(503, "unavailable")).toBe("unavailable");
    expect(errorOf(500, undefined)).toBe("unavailable");
    expect(errorOf(0, undefined)).toBe("unavailable");
  });
});

describe("KindForm", () => {
  it("обмін місцями: пілот з місця 3 на місце 1 — вони міняються, дубля немає; зміну оголошено в live-регіоні (J)", async () => {
    const user = userEvent.setup();
    form("Q", saved(ten(1, 2, 3)));
    await user.selectOptions(slot(1), "3");
    expect(slot(1)).toHaveValue("3");
    expect(slot(3)).toHaveValue("1");
    const live = document.querySelector('p.sr-only[aria-live="polite"]');
    expect(live).toHaveTextContent(fill(t.swapped, { name: "Расселл", to: 1, from: 3, other: "Антонеллі" }));
  });

  it("(J) обов'язкові місця 1–3 мають aria-required; помилка «оберіть пілотів» — через aria-describedby на блок помилки", async () => {
    const user = userEvent.setup();
    form("Q");
    for (const n of [1, 2, 3]) expect(slot(n)).toHaveAttribute("aria-required", "true");
    for (const n of [4, 10]) expect(slot(n)).not.toHaveAttribute("aria-required");
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(t.errors.required);
    for (const n of [1, 2, 3]) {
      expect(slot(n)).toHaveAttribute("aria-invalid", "true");
      expect(slot(n).getAttribute("aria-describedby")).toBe(alert.id);
    }
    expect(slot(4)).not.toHaveAttribute("aria-describedby");
  });

  it("(E) збережений пілот і команда, яких немає на сітці, не відправляються приховано: слот і команда очищені, показано попередження", async () => {
    const user = userEvent.setup();
    const spy = reply(200, { ok: true });
    form("R", saved(ten(1, 2, 3, 99), { dnfTeam: 555 }));
    expect(slot(4)).toHaveValue(""); // 99 немає серед опцій
    expect(screen.getByLabelText(t.dnf.label)).toHaveValue("");
    expect(screen.getByText(t.stale)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.save.R }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const body = sentBody(spy);
    expect(body.picks).toEqual(ten(1, 2, 3));
    expect(body.picks).not.toContain(99);
    expect(body.dnfTeam).toBeNull();
    await waitFor(() => expect(screen.queryByText(t.stale)).toBeNull()); // після збереження попередження зникає
  });

  it("(E) усі збережені id на сітці — попередження немає", () => {
    form("R", saved(ten(1, 2, 3), { dnfTeam: 191 }));
    expect(screen.queryByText(t.stale)).toBeNull();
    expect(screen.getByLabelText(t.dnf.label)).toHaveValue("191");
  });

  it("409 → «закрито» і onClosed; 429 → ліміт; 403 origin → збій, а не «заблоковано» (H)", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    const spy = reply(409, { error: "closed" });
    form("Q", saved(ten(1, 2, 3)), { onClosed });
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.errors.closed));
    expect(onClosed).toHaveBeenCalledTimes(1);
    spy.mockResolvedValue(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.errors.rateLimited));
    spy.mockResolvedValue(new Response(JSON.stringify({ error: "origin" }), { status: 403 }));
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.errors.unavailable));
    expect(screen.getByRole("alert")).not.toHaveTextContent(t.errors.blocked);
  });

  it("(F) 401 — форма просить сторінку перечитати стан (там з'явиться вхід із ?next=)", async () => {
    const user = userEvent.setup();
    const onUnauthorized = vi.fn();
    reply(401, { error: "unauthorized" });
    form("Q", saved(ten(1, 2, 3)), { onUnauthorized });
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(t.errors.unauthorized);
  });

  it("403 no_profile → onNoProfile", async () => {
    const user = userEvent.setup();
    const onNoProfile = vi.fn();
    reply(403, { error: "no_profile" });
    form("Q", saved(ten(1, 2, 3)), { onNoProfile });
    await user.click(screen.getByRole("button", { name: t.save.Q }));
    await waitFor(() => expect(onNoProfile).toHaveBeenCalledTimes(1));
  });
});
