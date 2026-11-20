import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import { LoginForm, type LoginText } from "../login-form";
import type { NickText } from "../nick-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const text = uk.auth.login as unknown as LoginText;
const nick = uk.auth.nick as unknown as NickText;

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("LoginForm: фокус (рев'ю 20.11)", () => {
  it("«Надіслати новий код»: після відповіді фокус іде в поле коду, а не губиться в заблокованій кнопці", async () => {
    let sent = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/auth/code")) {
        sent++;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" />);
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    await user.click(screen.getByRole("button", { name: text.send }));
    const code = await screen.findByLabelText(text.codeLabel);
    await waitFor(() => expect(code).toHaveFocus());
    // відлік 60 с до «Надіслати новий код»
    for (let i = 0; i < 61; i++) await act(async () => void vi.advanceTimersByTime(1000));
    await user.click(screen.getByRole("button", { name: text.resend }));
    expect(await screen.findByText(text.resent)).toBeInTheDocument();
    expect(sent).toBe(2);
    await waitFor(() => expect(screen.getByLabelText(text.codeLabel)).toHaveFocus());
  });

  it("помилка запиту коду: фокус повертається в поле пошти, повідомлення — в role=alert", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" />);
    const email = screen.getByLabelText(text.emailLabel);
    await user.type(email, "a@b.co");
    await user.click(screen.getByRole("button", { name: text.send }));
    expect(await screen.findByText(text.errors.unavailable)).toBeInTheDocument();
    await waitFor(() => expect(email).toHaveFocus());
  });
});
