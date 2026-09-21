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

  it("opens title details and returns without losing the active preference session", async () => {
    render(<PreferenceEntryFlow />);

    const preferenceInput = screen.getByLabelText(
      /Tell PickTonight what you want/i,
    );

    fireEvent.change(preferenceInput, {
      target: {
        value: "funny movie",
      },
    });

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

    const detailsButton = within(results).getByRole("button", {
      name: "Details: Preview movie A",
    });

    detailsButton.focus();
    fireEvent.click(detailsButton);

    const detail = screen.getByRole("region", {
      name: "Title details for Preview movie A",
    });

    expect(detail).toBeInTheDocument();

    expect(
      within(detail).getByRole("heading", {
        level: 2,
        name: "Preview movie A",
      }),
    ).toHaveFocus();

    expect(
      screen.queryByRole("region", {
        name: "3 picks for tonight",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(detail).getByRole("button", {
        name: "Choose tonight: Preview movie A",
      }),
    );

    expect(
      screen.getByRole("status", {
        name: "Preview action status",
      }),
    ).toHaveTextContent(
      "Watch intent set for Preview movie A. This does not mark the title as watched.",
    );

    fireEvent.click(
      within(detail).getByRole("button", {
        name: "Back to 3 picks",
      }),
    );

    const restoredResults = screen.getByRole("region", {
      name: "3 picks for tonight",
    });

    expect(within(restoredResults).getAllByRole("article")).toHaveLength(3);

    expect(
      within(restoredResults).getByRole("button", {
        name: "Details: Preview movie A",
      }),
    ).toHaveFocus();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to request",
      }),
    );

    expect(
      screen.getByLabelText(/Tell PickTonight what you want/i),
    ).toHaveValue("funny movie");
  });

  it("keeps partial release-year typing render-safe and blocks review until valid", () => {
    render(<PreferenceEntryFlow />);

    fireEvent.click(screen.getByText("More preferences"));

    const releaseYear = screen.getByRole("spinbutton", {
      name: "Released since year",
    });

    for (const value of ["2", "20", "202"]) {
      fireEvent.change(releaseYear, {
        target: { value },
      });

      expect(
        screen.getByRole("heading", {
          name: "What would feel right to watch?",
        }),
      ).toBeInTheDocument();

      expect(releaseYear).toHaveAttribute("aria-invalid", "true");
    }

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review preferences",
      }),
    );

    expect(releaseYear).toHaveFocus();

    expect(
      screen.queryByRole("heading", {
        name: "Review what we understood",
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(releaseYear, {
      target: { value: "2023" },
    });

    expect(releaseYear).not.toHaveAttribute("aria-invalid");

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

    expect(screen.getByText("Released since 2023")).toBeInTheDocument();
  });

  it("associates visible preference instructions with their controls and groups", () => {
    render(<PreferenceEntryFlow />);

    const typedRequest = screen.getByLabelText(
      /Tell PickTonight what you want/i,
    );

    expect(typedRequest).toHaveAttribute(
      "aria-describedby",
      "preference-text-help",
    );

    expect(document.getElementById("preference-text-help")).toHaveTextContent(
      "not written to PickTonight local storage or analytics",
    );

    const genreGroup = screen.getByRole("group", {
      name: "Genre",
    });

    expect(genreGroup).toHaveAttribute(
      "aria-describedby",
      "preference-genre-help",
    );

    fireEvent.click(screen.getByText("More preferences"));

    const releaseYear = screen.getByRole("spinbutton", {
      name: "Released since year",
    });

    expect(releaseYear).toHaveAttribute(
      "aria-describedby",
      "preference-release-year-help",
    );

    const watchRegion = screen.getByRole("combobox", {
      name: "Watch region",
    });

    expect(watchRegion).toHaveAttribute(
      "aria-describedby",
      "preference-watch-region-help",
    );

    const providerGroup = screen.getByRole("group", {
      name: "Streaming providers",
    });

    expect(providerGroup).toHaveAttribute(
      "aria-describedby",
      "preference-provider-help preference-provider-selection-help",
    );

    fireEvent.change(watchRegion, {
      target: { value: "GB" },
    });

    expect(providerGroup).toHaveAttribute(
      "aria-describedby",
      "preference-provider-help preference-provider-region-notice",
    );
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
