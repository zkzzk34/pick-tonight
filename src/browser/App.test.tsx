import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./analytics-consent-storage";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("presents the focused product promise", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Choose what to watch without the endless scroll.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText(/choose something tonight in under two minutes/i)
        .length,
    ).toBeGreaterThanOrEqual(1);

    expect(
      screen.getAllByText(/exactly three explainable recommendations/i).length,
    ).toBeGreaterThanOrEqual(1);

    const promises = screen.getByRole("list", {
      name: "PickTonight product promises",
    });

    expect(within(promises).getAllByRole("listitem")).toHaveLength(3);
    expect(within(promises).getByText("Under two minutes")).toBeInTheDocument();
    expect(
      within(promises).getByText("Three focused options"),
    ).toBeInTheDocument();
    expect(
      within(promises).getByText("No account required"),
    ).toBeInTheDocument();
  });

  it("offers equally presented accept and decline controls", () => {
    render(<App />);

    const choices = screen.getByRole("group", {
      name: "Analytics consent choices",
    });

    const allowButton = within(choices).getByRole("button", {
      name: "Allow analytics",
    });

    const declineButton = within(choices).getByRole("button", {
      name: "No thanks",
    });

    expect(allowButton).toHaveClass("analytics-consent__choice");
    expect(declineButton).toHaveClass("analytics-consent__choice");

    expect(
      screen.getByRole("link", { name: "Review privacy details" }),
    ).toHaveAttribute("href", "#privacy");
  });

  it("stores a declined choice without disabling recommendations", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"declined"}',
    );

    expect(
      screen.getByRole("heading", {
        name: "Analytics choice: declined",
      }),
    ).toBeInTheDocument();

    const reviewButton = screen.getByRole("button", {
      name: "Review preferences",
    });

    expect(reviewButton).toBeEnabled();

    expect(
      screen.getByRole("region", {
        name: "Card presentation preview",
      }),
    ).toBeInTheDocument();

    fireEvent.click(reviewButton);

    expect(
      screen.getByRole("button", {
        name: "Show 3 picks",
      }),
    ).toBeEnabled();
  });

  it("stores an accepted analytics choice", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Allow analytics",
      }),
    );

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );

    expect(
      screen.getByRole("heading", {
        name: "Analytics choice: allowed",
      }),
    ).toBeInTheDocument();
  });

  it("restores a previously accepted analytics choice", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Analytics choice: allowed",
      }),
    ).toBeInTheDocument();

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    expect(within(privacy).getByText(/Allowed\./)).toBeInTheDocument();
  });

  it("allows the stored analytics choice to be reset locally", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"declined"}',
    );

    render(<App />);

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    fireEvent.click(
      within(privacy).getByRole("button", {
        name: "Reset analytics choice",
      }),
    );

    expect(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    ).toBeNull();

    expect(
      screen.getByRole("heading", {
        name: "Help improve PickTonight?",
      }),
    ).toBeInTheDocument();
  });

  it("treats malformed stored consent as undecided and safe-off", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":99,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Help improve PickTonight?",
      }),
    ).toBeInTheDocument();

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    expect(within(privacy).getByText(/Not chosen\./)).toBeInTheDocument();

    expect(
      within(privacy).getByRole("button", {
        name: "Reset analytics choice",
      }),
    ).toBeDisabled();
  });

  it("links the footer to Privacy and Credits sections", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "#privacy",
    );

    expect(screen.getByRole("link", { name: "Credits" })).toHaveAttribute(
      "href",
      "#credits",
    );

    expect(
      screen.getByRole("region", {
        name: "Your choice stays separate from your picks.",
      }),
    ).toHaveAttribute("id", "privacy");

    expect(screen.getByRole("region", { name: "Credits" })).toHaveAttribute(
      "id",
      "credits",
    );
  });
});
