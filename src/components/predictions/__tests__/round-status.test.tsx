import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import uk from "@/i18n/dictionaries/uk.json";
import type { PredictionsText } from "../types";
import { RoundAction } from "../round-status";

/** Акаунт-стор і годинник — підміни: перевіряємо лише, що кнопка етапу показує за станом гостя/гравця/закритого етапу. */
const account = vi.hoisted(() => ({ value: { status: "anon" } as { status: string } }));
const hydrated = vi.hoisted(() => ({ value: true }));
vi.mock("@/components/auth/account-store", () => ({ useAccount: () => account.value }));
vi.mock("@/components/calendar/clock", () => ({ useNow: () => Date.parse("2026-11-20T12:00:00Z"), useHydrated: () => hydrated.value }));

const text = uk.predictions as unknown as PredictionsText;
const open = "2026-11-28T19:55:00Z";
const closed = "2026-11-19T19:55:00Z";
const mount = (deadlineAt: string | null) => render(<RoundAction deadlineAt={deadlineAt} href="/uk/predictions/22" text={text} loginHref="/uk/login" />);

describe("кнопка етапу в списку прогнозів", () => {
  beforeEach(() => {
    account.value = { status: "anon" };
    hydrated.value = true;
  });

  it("гість, етап відкритий: «Увійдіть, щоб зробити прогноз» → вхід із поверненням на етап", () => {
    mount(open);
    const link = screen.getByRole("link", { name: "Увійдіть, щоб зробити прогноз" });
    expect(link).toHaveAttribute("href", "/uk/login?next=%2Fuk%2Fpredictions%2F22");
  });

  it("до гідратації (статичний HTML) — звичайне посилання на етап: без JS воно теж працює", () => {
    hydrated.value = false;
    mount(open);
    expect(screen.getByRole("link", { name: "Зробити прогноз" })).toHaveAttribute("href", "/uk/predictions/22");
  });

  it("гравець або сесія ще перевіряється — «Зробити прогноз», а не пропозиція входу", () => {
    for (const status of ["user", "loading", "unavailable"]) {
      account.value = { status };
      const { unmount } = mount(open);
      expect(screen.getByRole("link", { name: "Зробити прогноз" })).toHaveAttribute("href", "/uk/predictions/22");
      unmount();
    }
  });

  it("етап закрито — «Дивитися прогнози» навіть для гостя (входити нема для чого)", () => {
    mount(closed);
    expect(screen.getByRole("link", { name: "Дивитися прогнози" })).toHaveAttribute("href", "/uk/predictions/22");
  });
});
