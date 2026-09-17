import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import {
  ANALYTICS_IDENTITY_STORAGE_KEY,
  ANALYTICS_SESSION_STORAGE_KEY,
} from "./analytics-identity-storage";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./analytics-consent-storage";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("creates no analytics identifiers before consent or after declining", () => {
    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();
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

  it("stores an accepted analytics choice and creates consent-gated identifiers", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Allow analytics",
      }),
    );

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );

    const browserIdentity = JSON.parse(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY) ?? "null",
    ) as unknown;
    const sessionIdentity = JSON.parse(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY) ?? "null",
    ) as unknown;

    expect(browserIdentity).toMatchObject({
      version: 1,
      id: expect.any(String),
    });
    expect(sessionIdentity).toMatchObject({
      version: 1,
      id: expect.any(String),
    });

    expect(
      screen.getByRole("heading", {
        name: "Analytics choice: allowed",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/random pseudonymous browser identifier/i),
    ).toBeInTheDocument();
  });

  it("restores accepted consent and establishes identifiers for the page session", () => {
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

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    expect(within(privacy).getByText(/Allowed\./)).toBeInTheDocument();
  });

  it("withdraws analytics consent, removes identifiers, and creates fresh IDs after re-consent", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    const firstBrowserIdentity = window.localStorage.getItem(
      ANALYTICS_IDENTITY_STORAGE_KEY,
    );
    const firstSessionIdentity = window.sessionStorage.getItem(
      ANALYTICS_SESSION_STORAGE_KEY,
    );

    expect(firstBrowserIdentity).not.toBeNull();
    expect(firstSessionIdentity).not.toBeNull();

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
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

    expect(
      screen.getByRole("heading", {
        name: "Help improve PickTonight?",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBe(firstBrowserIdentity);
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBe(firstSessionIdentity);
  });

  it("treats malformed stored consent as undecided, safe-off, and removes stale analytics IDs", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":99,"choice":"accepted"}',
    );
    window.localStorage.setItem(
      ANALYTICS_IDENTITY_STORAGE_KEY,
      '{"version":1,"id":"11111111-1111-4111-8111-111111111111"}',
    );
    window.sessionStorage.setItem(
      ANALYTICS_SESSION_STORAGE_KEY,
      '{"version":1,"id":"22222222-2222-4222-8222-222222222222"}',
    );

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Help improve PickTonight?",
      }),
    ).toBeInTheDocument();

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

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
