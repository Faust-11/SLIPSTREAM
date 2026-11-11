import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LangSwitch } from "../lang-switch";
import { LOCALE_LABEL } from "@/i18n/config";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => ["teams"],
  useSearchParams: () => new URLSearchParams("q=lotus"),
}));

const names = { en: "English", uk: "Українська" };

describe("LangSwitch", () => {
  it("видимі коди мов — UA і EN (рішення користувача 11.11), hreflang/lang лишаються uk", () => {
    expect(LOCALE_LABEL).toEqual({ en: "EN", uk: "UA" });
    render(<LangSwitch current="en" label="Language" names={names} />);
    const group = screen.getByRole("group", { name: "Language" });
    expect(group).toHaveAttribute("translate", "no");
    expect(group).toHaveTextContent(/^UA — УкраїнськаEN$/);
    const toUk = screen.getByRole("link", { name: "UA — Українська" });
    expect(toUk).toHaveAttribute("hreflang", "uk");
    expect(toUk).toHaveAttribute("lang", "uk");
    expect(toUk).toHaveAttribute("href", "/uk/teams?q=lotus");
  });

  it("поточна мова — UA без посилання, з aria-current", () => {
    render(<LangSwitch current="uk" label="Мова" names={names} />);
    const current = screen.getByText("UA");
    expect(current.tagName).toBe("SPAN");
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toHaveAttribute("lang", "uk");
    expect(screen.getByRole("link", { name: "EN — English" })).toHaveAttribute("href", "/teams?q=lotus");
  });
});
