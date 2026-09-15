import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import { WATCHLIST_STORAGE_KEY } from "./watchlist-storage";

describe("App local watchlist", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores and removes titles while preserving the active Choose session", async () => {
    const firstMount = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Review preferences" }));

    const initialRequestRegion = screen.getByRole("region", {
      name: "Recommendation request",
    });
    fireEvent.click(
      within(initialRequestRegion).getByRole("button", {
        name: "Show 3 picks",
      }),
    );

    const initialResults = await screen.findByRole("region", {
      name: "3 picks for tonight",
    });
    const initialCards = within(initialResults).getAllByRole("article");

    fireEvent.click(
      within(initialCards[0]).getByRole("button", {
        name: "Save: Preview movie A",
      }),
    );
    fireEvent.click(
      within(initialCards[1]).getByRole("button", {
        name: "Save: Preview television B",
      }),
    );

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toContain(
      '"title":"Preview television B"',
    );
    expect(screen.getByRole("button", { name: "Saved (2)" })).toBeEnabled();

    firstMount.unmount();
    render(<App />);

    const requestField = screen.getAllByRole("textbox")[0];
    fireEvent.change(requestField, {
      target: { value: "quiet Korean drama" },
    });

    const savedNavigation = screen.getByRole("button", { name: "Saved (2)" });
    fireEvent.click(savedNavigation);

    expect(savedNavigation).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText(/only in this browser, on this device/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/they do not synchronize to another browser or device/i),
    ).toBeInTheDocument();

    const savedList = screen.getByRole("list", {
      name: "Saved titles, newest first",
    });
    expect(
      within(savedList)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Preview television B", "Preview movie A"]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove: Preview television B",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Remove: Preview movie A" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("status", { name: "Saved titles status" }),
    ).toHaveTextContent("Removed Preview television B from Saved.");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove: Preview movie A" }),
    );

    const emptyAction = screen.getByRole("button", {
      name: "Find something to watch",
    });
    expect(emptyAction).toHaveFocus();
    expect(screen.getByRole("button", { name: "Saved (0)" })).toBeEnabled();
    expect(
      window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "",
    ).not.toContain('"mediaKey"');

    fireEvent.click(emptyAction);

    expect(screen.getByRole("button", { name: "Choose" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(requestField).toHaveValue("quiet Korean drama");
  });

  it("shares Saved state across recommendation cards, details, and the Saved view", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Review preferences" }));

    const requestRegion = screen.getByRole("region", {
      name: "Recommendation request",
    });
    fireEvent.click(
      within(requestRegion).getByRole("button", { name: "Show 3 picks" }),
    );

    const results = await screen.findByRole("region", {
      name: "3 picks for tonight",
    });
    const initialCards = within(results).getAllByRole("article");

    const movieSave = within(initialCards[0]).getByRole("button", {
      name: "Save: Preview movie A",
    });
    fireEvent.click(movieSave);

    expect(movieSave).toHaveTextContent("Saved");
    expect(movieSave).toHaveAttribute("aria-pressed", "true");
    expect(movieSave).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(
      within(initialCards[1]).getByRole("button", {
        name: "Details: Preview television B",
      }),
    );

    const details = screen.getByRole("region", {
      name: "Title details for Preview television B",
    });
    const televisionSave = within(details).getByRole("button", {
      name: "Save: Preview television B",
    });
    fireEvent.click(televisionSave);

    expect(televisionSave).toHaveTextContent("Saved");
    expect(televisionSave).toHaveAttribute("aria-pressed", "true");
    expect(televisionSave).toHaveAttribute("aria-disabled", "true");

    const savedNavigation = screen.getByRole("button", { name: "Saved (2)" });
    fireEvent.click(savedNavigation);

    const savedList = screen.getByRole("list", {
      name: "Saved titles, newest first",
    });
    expect(
      within(savedList)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Preview television B", "Preview movie A"]);

    const storedWatchlist = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    expect(storedWatchlist).toContain('"title":"Preview television B"');
    expect(storedWatchlist).toContain('"title":"Preview movie A"');
    expect(storedWatchlist).not.toContain("overview");
  });
});
