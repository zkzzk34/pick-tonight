import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  formatAccessibilityViolations,
  runAccessibilityScan,
} from "../test/accessibility";
import App from "./App";

async function expectNoAutomatedViolations(): Promise<void> {
  const results = await runAccessibilityScan(document.body);

  expect(results.violations, formatAccessibilityViolations(results)).toEqual(
    [],
  );
}

describe("automated accessibility regression checks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("has no detectable WCAG A/AA violations on the initial experience", async () => {
    render(<App />);

    await expectNoAutomatedViolations();
  });

  it("has no detectable WCAG A/AA violations after analytics are declined", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "No thanks",
      }),
    );

    await expectNoAutomatedViolations();
  });

  it("has no detectable WCAG A/AA violations in preference review", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "No thanks",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Review what we understood",
      }),
    ).toBeInTheDocument();

    await expectNoAutomatedViolations();
  });

  it("has no detectable WCAG A/AA violations in recommendations and title details", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "No thanks",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 3 picks",
      }),
    );

    const results = await screen.findByRole("region", {
      name: "3 picks for tonight",
    });

    await expectNoAutomatedViolations();

    fireEvent.click(
      within(results).getByRole("button", {
        name: "Details: Preview movie A",
      }),
    );

    const detail = screen.getByRole("region", {
      name: "Title details for Preview movie A",
    });

    expect(
      within(detail).getByRole("heading", {
        level: 2,
        name: "Preview movie A",
      }),
    ).toHaveFocus();

    await expectNoAutomatedViolations();
  });

  it("has no detectable WCAG A/AA violations in the saved view", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /^Saved \(0\)$/,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Saved for later",
      }),
    ).toBeInTheDocument();

    await expectNoAutomatedViolations();
  });

  it("has no detectable WCAG A/AA violations in the destructive confirmation dialog", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset all PickTonight data",
      }),
    );

    expect(
      screen.getByRole("alertdialog", {
        name: "Reset all PickTonight data?",
      }),
    ).toBeInTheDocument();

    await expectNoAutomatedViolations();
  });
});
