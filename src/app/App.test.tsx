import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("presents the focused prototype promise", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Choose what to watch without the endless scroll.",
      }),
    ).toBeInTheDocument();

    const promises = screen.getByRole("list", {
      name: "PickTonight product promises",
    });

    expect(within(promises).getAllByRole("listitem")).toHaveLength(3);
    expect(within(promises).getByText("Under two minutes")).toBeInTheDocument();
    expect(
      within(promises).getByText("No account required"),
    ).toBeInTheDocument();
  });
});
