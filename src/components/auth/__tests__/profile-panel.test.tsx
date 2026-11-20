import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import { refreshAccount } from "../account-store";
import { ProfilePanel, type ProfileText } from "../profile-panel";
import type { NickText } from "../nick-form";

const text = uk.auth.profile as unknown as ProfileText;
const nick = uk.auth.nick as unknown as NickText;
const panel = <ProfilePanel text={text} nick={nick} loginHref="/uk/login" homeHref="/uk" />;

/** Відповіді фейкового сервера: /api/session — що підставили, /api/auth/nick — успіх. */
function server(session: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/session")) return new Response(JSON.stringify(session), { status: 200 });
    if (url.includes("/api/auth/nick")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
}

beforeEach(() => {
  document.cookie = "outlap_in=1; path=/";
});
afterEach(() => {
  document.cookie = "outlap_in=; path=/; max-age=0";
});

describe("ProfilePanel (рев'ю 20.11)", () => {
  it("профіль прочитати не вдалося (profile:false) — «недоступно» і жодної форми вибору ніка (upsert мовчки перезаписав би нік)", async () => {
    server({ user: { nick: null, profile: false } });
    render(panel);
    await act(() => refreshAccount());
    expect(screen.getByRole("alert")).toHaveTextContent(text.unavailable);
    expect(screen.queryByLabelText(nick.label)).toBeNull();
    expect(screen.getByRole("button", { name: text.signOut })).toBeInTheDocument();
  });

  it("є нік: «Змінити» → форма зі «Скасувати»; скасування повертає фокус на «Змінити»", async () => {
    server({ user: { nick: "Max", profile: true } });
    const user = userEvent.setup();
    render(panel);
    await act(() => refreshAccount());
    await user.click(screen.getByRole("button", { name: text.change }));
    expect(screen.getByLabelText(nick.label)).toHaveValue("Max");
    await user.click(screen.getByRole("button", { name: text.cancel }));
    expect(screen.queryByLabelText(nick.label)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: text.change })).toHaveFocus());
  });

  it("збереження ніка: «Нікнейм збережено.» в живому регіоні, фокус — на «Змінити»", async () => {
    server({ user: { nick: "Max", profile: true } });
    const user = userEvent.setup();
    render(panel);
    await act(() => refreshAccount());
    await user.click(screen.getByRole("button", { name: text.change }));
    const input = screen.getByLabelText(nick.label);
    await user.clear(input);
    await user.type(input, "Max Verstappen");
    await user.click(screen.getByRole("button", { name: nick.save }));
    expect(await screen.findByText(nick.saved)).toBeInTheDocument();
    expect(screen.getByText("Max Verstappen")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: text.change })).toHaveFocus());
  });

  it("без ніка форма вибору — без «Скасувати» (повертатись нікуди)", async () => {
    server({ user: { nick: null, profile: true } });
    render(panel);
    await act(() => refreshAccount());
    expect(screen.getByLabelText(nick.label)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: text.cancel })).toBeNull();
  });

  it("серверна розмітка: «Завантаження…», а «Ви не ввійшли» лише в <noscript> — той, хто ввійшов, не бачить неправди до гідратації", () => {
    const html = renderToString(panel);
    expect(html).toContain(text.loading);
    const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    expect(outsideNoscript).not.toContain(text.signedOutH);
    expect(html).toMatch(/<noscript>[\s\S]*Ви не ввійшли[\s\S]*<\/noscript>/);
  });
});
