import { describe, expect, it } from "vitest";

describe("тестове середовище", () => {
  it("працює в jsdom з матчерами jest-dom", () => {
    const el = document.createElement("p");
    el.textContent = "Outlap";
    document.body.append(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("Outlap");
  });
});
