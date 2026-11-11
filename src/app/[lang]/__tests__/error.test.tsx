import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../error";

const params = vi.hoisted(() => ({ lang: "uk" as string | undefined }));
vi.mock("next/navigation", () => ({ useParams: () => params }));

describe("error.tsx", () => {
  it("мовою сторінки, кнопка викликає retry, посилання на головну тією ж мовою", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    params.lang = "uk";
    render(<ErrorBoundary error={new Error("x")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Щось пішло не так");
    expect(screen.getByRole("link", { name: "На головну" })).toHaveAttribute("href", "/uk");
    await userEvent.setup().click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("невідома мова → англійська", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    params.lang = "de";
    render(<ErrorBoundary error={new Error("x")} retry={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });
});
