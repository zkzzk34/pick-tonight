import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PreferenceEntryFlow } from "./preference-entry";

describe("PreferenceEntryFlow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("supports text entry, review, and honest unsupported text", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.change(screen.getByLabelText(/Tell PickTonight what you want/i), {
      target: {
        value: "something light to watch with friends",
      },
    });

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

    expect(screen.getByText("Friends")).toBeInTheDocument();
    expect(screen.getByText("light")).toBeInTheDocument();
    expect(
      screen.getByText(/did not silently turn these words into preferences/i),
    ).toBeInTheDocument();
  });

  it("lets explicit tag controls override typed conflicts", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.change(screen.getByLabelText(/Tell PickTonight what you want/i), {
      target: { value: "funny movie" },
    });

    fireEvent.click(screen.getByRole("button", { name: "TV" }));

    fireEvent.click(screen.getByRole("button", { name: "Romantic" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Explicit controls took priority",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("TV")).toBeInTheDocument();
    expect(screen.getByText("Romantic")).toBeInTheDocument();
  });

  it("keeps raw typed text out of persistent browser storage", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.change(screen.getByLabelText(/Tell PickTonight what you want/i), {
      target: {
        value: "funny Korean movie under two hours",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("allows an interpreted preference to be removed before requesting recommendations", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.change(screen.getByLabelText(/Tell PickTonight what you want/i), {
      target: {
        value: "funny movie",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(screen.getByText("Make me laugh")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Mood: Make me laugh",
      }),
    );

    expect(
      screen.getByText("No optional ranking preferences."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Make me laugh")).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Show 3 picks",
      }),
    ).toBeEnabled();
  });

  it("uses a US-only provider shortlist and clears it when region changes", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.click(screen.getByText("More preferences"));

    const netflix = screen.getByRole("button", {
      name: "Netflix",
    });

    expect(netflix).toBeEnabled();

    fireEvent.click(netflix);
    expect(netflix).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Watch region"), {
      target: { value: "GB" },
    });

    expect(screen.getByRole("button", { name: "Netflix" })).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(screen.queryByText("Required provider")).not.toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
  });

  it("allows a completely broad request to continue", () => {
    render(<PreferenceEntryFlow />);

    expect(screen.getByRole("status")).toHaveTextContent("Broad");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(screen.getByText("No required restrictions.")).toBeInTheDocument();

    expect(
      screen.getByText("No optional ranking preferences."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Show 3 picks",
      }),
    ).toBeEnabled();
  });

  it("feeds reviewed structured preferences into the existing request flow", async () => {
    render(<PreferenceEntryFlow />);

    fireEvent.click(screen.getByRole("button", { name: "Movie" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Make me laugh",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    const requestRegion = screen.getByRole("region", {
      name: "Recommendation request",
    });

    fireEvent.click(
      within(requestRegion).getByRole("button", {
        name: "Show 3 picks",
      }),
    );

    const results = await within(requestRegion).findByRole("region", {
      name: "3 picks for tonight",
    });

    expect(within(results).getAllByRole("article")).toHaveLength(3);
  });
});
