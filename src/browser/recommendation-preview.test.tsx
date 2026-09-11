import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App recommendation preview", () => {
  it("labels sample data and replaces only the selected card", () => {
    render(<App />);

    expect(
      screen.getByText(/They are not live recommendations/),
    ).toBeInTheDocument();

    const results = screen.getByRole("region", {
      name: "3 picks for tonight",
    });
    const initialCards = within(results).getAllByRole("article");

    expect(initialCards).toHaveLength(3);

    fireEvent.click(
      within(initialCards[0]).getByRole("button", {
        name: "Save: Preview movie A",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "save selected for Preview movie A. Preview actions are not saved.",
    );

    fireEvent.click(
      within(initialCards[1]).getByRole("button", {
        name: "Replace: Preview television B",
      }),
    );

    const updatedCards = within(results).getAllByRole("article");
    expect(
      updatedCards.map(
        (card) => within(card).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["Preview movie A", "Preview movie D", "Preview movie C"]);
    expect(updatedCards[0]).toBe(initialCards[0]);
    expect(updatedCards[2]).toBe(initialCards[2]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preview television B was replaced with Preview movie D. The other recommendations stayed in place.",
    );
  });
});
