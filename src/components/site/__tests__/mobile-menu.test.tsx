import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMenu } from "../mobile-menu";

vi.mock("next/navigation", () => ({ useSelectedLayoutSegments: () => ["teams"] }));

const items = [
  { key: "seasons", href: "/uk/seasons", label: "Сезони" },
  { key: "teams", href: "/uk/teams", label: "Команди" },
  { key: "game", href: "/uk/game", label: "Гра", accent: "yellow" as const },
];

function setup() {
  render(
    <>
      <MobileMenu items={items} labels={{ open: "Меню", nav: "Головне меню" }} />
      <main data-mnav-inert>контент</main>
    </>,
  );
  return { user: userEvent.setup(), button: screen.getByRole("button", { name: "Меню" }) };
}

// jsdom не вміє переходити між документами: справжній перехід перевіряє e2e.
function preventNavigation(e: MouseEvent) {
  if ((e.target as Element).closest("a")) e.preventDefault();
}

describe("MobileMenu", () => {
  beforeEach(() => {
    document.body.className = "";
    document.addEventListener("click", preventNavigation);
    return () => document.removeEventListener("click", preventNavigation);
  });

  it("закрите за замовчуванням: aria-expanded=false і aria-controls на панель", () => {
    const { button } = setup();
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panelId = button.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeVisible();
  });

  it("клік відкриває панель з усіма посиланнями", async () => {
    const { user, button } = setup();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("Меню");
    const panel = screen.getByRole("navigation", { name: "Головне меню" });
    expect(panel).toBeVisible();
    expect(within(panel).getAllByRole("link")).toHaveLength(3);
  });

  it("активний розділ позначено aria-current=page", async () => {
    const { user, button } = setup();
    await user.click(button);
    expect(screen.getByRole("link", { name: "Команди" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Сезони" })).not.toHaveAttribute("aria-current");
  });

  it("Escape закриває і повертає фокус на кнопку", async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("клік по посиланню закриває меню", async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.click(screen.getByRole("link", { name: "Сезони" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("поки відкрите — контент під ним inert, а сторінка не прокручується", async () => {
    const { user, button } = setup();
    const main = screen.getByRole("main");
    await user.click(button);
    expect(main).toHaveAttribute("inert");
    expect(document.body).toHaveClass("mnav-open");
    await user.click(button);
    expect(main).not.toHaveAttribute("inert");
    expect(document.body).not.toHaveClass("mnav-open");
  });
});
