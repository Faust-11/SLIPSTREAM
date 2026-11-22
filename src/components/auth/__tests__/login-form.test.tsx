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

describe("LoginForm: сесія після verify (/code-review high)", () => {
  /** Крок «код»: пошта → код → відповідь /api/auth/verify. */
  async function toVerify(verifyBody: object, session: object) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/code")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url.includes("/api/auth/verify")) return new Response(JSON.stringify(verifyBody), { status: 200 });
      if (url.includes("/api/session")) return new Response(JSON.stringify(session), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" />);
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    await user.click(screen.getByRole("button", { name: text.send }));
    await user.type(await screen.findByLabelText(text.codeLabel), "12345678");
    await user.click(screen.getByRole("button", { name: text.verify }));
  }

  it("браузер не зберіг cookie (позначки outlap_in немає): замість форми ніка — «недоступно» (нік-POST дав би 401, код уже згорів)", async () => {
    document.cookie = "outlap_in=; path=/; max-age=0";
    await toVerify({ ok: true, nick: null, profile: true }, { user: null });
    expect(await screen.findByText(text.errors.unavailable)).toBeInTheDocument();
    expect(screen.queryByLabelText(nick.label)).toBeNull();
  });
  it("сесія є (позначка та /api/session підтверджують): без ніка — форма вибору ніка", async () => {
    document.cookie = "outlap_in=1; path=/";
    await toVerify({ ok: true, nick: null, profile: true }, { user: { nick: null, profile: true } });
    expect(await screen.findByLabelText(nick.label)).toBeInTheDocument();
    document.cookie = "outlap_in=; path=/; max-age=0";
  });
});

describe("LoginForm: Turnstile (21.11)", () => {
  type Opts = { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; "error-callback": () => void; language: string; appearance: string };
  let opts: Opts | null;
  let api: { render: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  const bodies: Record<string, unknown>[] = [];

  beforeEach(() => {
    opts = null;
    bodies.length = 0;
    api = {
      render: vi.fn((_el: HTMLElement, o: Opts) => {
        opts = o;
        return "w1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/auth/code")) {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    delete (window as { turnstile?: unknown }).turnstile;
    document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((s) => s.remove());
  });

  it("без ключа: скрипт Cloudflare не вантажиться, віджета й підпису нема, запит без токена", async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" />);
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
    expect(screen.queryByText(text.botCheck)).toBeNull();
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    await user.click(screen.getByRole("button", { name: text.send }));
    await screen.findByLabelText(text.codeLabel);
    expect(bodies).toEqual([{ email: "a@b.co" }]);
  });

  it("з ключем: віджет рендериться (interaction-only, мова), кнопка чекає токен, токен іде в запит, після відправки — reset", async () => {
    (window as { turnstile?: unknown }).turnstile = api;
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" turnstile={{ siteKey: "1x0000", lang: "uk" }} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(opts).toMatchObject({ sitekey: "1x0000", appearance: "interaction-only", language: "uk" });
    expect(screen.getByText(text.botCheck)).toBeInTheDocument();
    // токена ще нема — кнопка заблокована й каже «Перевірка…», статус — у live-регіоні
    const btn = screen.getByRole("button", { name: text.checking });
    expect(btn).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(text.checking);
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    act(() => opts!.callback("TOKEN-1"));
    const send = await screen.findByRole("button", { name: text.send });
    expect(send).toBeEnabled();
    await user.click(send);
    await screen.findByLabelText(text.codeLabel);
    expect(bodies).toEqual([{ email: "a@b.co", captchaToken: "TOKEN-1" }]);
    // Токен одноразовий: на кроці коду — новий віджет (старий знято), «Новий код» чекає свіжий токен.
    expect(api.remove).toHaveBeenCalledWith("w1");
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("status").some((el) => el.textContent === text.checking)).toBe(true);
  });

  it("помилка відповіді сервера (крок пошти лишається): віджет скидається й токен очищено", async () => {
    (window as { turnstile?: unknown }).turnstile = api;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" turnstile={{ siteKey: "1x0000", lang: "uk" }} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    act(() => opts!.callback("T"));
    await user.click(await screen.findByRole("button", { name: text.send }));
    expect(await screen.findByText(text.errors.unavailable)).toBeInTheDocument();
    await waitFor(() => expect(api.reset).toHaveBeenCalledWith("w1"));
    expect(screen.getByRole("button", { name: text.checking })).toBeDisabled(); // чекає новий токен
  });

  it("expired-callback повертає очікування; помилка віджета/скрипта — спроба дає зрозумілу помилку без запиту", async () => {
    (window as { turnstile?: unknown }).turnstile = api;
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" turnstile={{ siteKey: "1x0000", lang: "uk" }} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts!.callback("T"));
    expect(await screen.findByRole("button", { name: text.send })).toBeEnabled();
    act(() => opts!["expired-callback"]());
    expect(await screen.findByRole("button", { name: text.checking })).toBeDisabled();
    act(() => opts!["error-callback"]());
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    await user.click(await screen.findByRole("button", { name: text.send }));
    expect(await screen.findByText(text.errors.captcha)).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it("сервер відповів captcha/captcha_required — той самий зрозумілий текст", async () => {
    (window as { turnstile?: unknown }).turnstile = api;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "captcha" }), { status: 400 }));
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<LoginForm text={text} nick={nick} fallbackHref="/uk/profile" turnstile={{ siteKey: "1x0000", lang: "uk" }} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    await user.type(screen.getByLabelText(text.emailLabel), "a@b.co");
    act(() => opts!.callback("T"));
    await user.click(await screen.findByRole("button", { name: text.send }));
    expect(await screen.findByText(text.errors.captcha)).toBeInTheDocument();
  });
});
