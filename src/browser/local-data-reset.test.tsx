import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import {
  ANALYTICS_IDENTITY_STORAGE_KEY,
  ANALYTICS_SESSION_STORAGE_KEY,
} from "./analytics-identity-storage";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./analytics-consent-storage";
import {
  WATCHLIST_STORAGE_KEY,
  writeWatchlist,
  type SavedTitle,
} from "./watchlist-storage";

const SAVED_TITLE: SavedTitle = {
  mediaKey: "movie:101",
  mediaType: "movie",
  title: "Preview movie A",
  year: 2001,
  posterUrl: null,
};

function storeSavedTitle(): void {
  expect(writeWatchlist(window.localStorage, [SAVED_TITLE])).toBe(true);
}

function failStorageRemovalFor(keyToFail: string): void {
  const originalRemoveItem = Storage.prototype.removeItem;

  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
    this: Storage,
    key: string,
  ) {
    if (key === keyToFail) {
      throw new DOMException("Storage access is blocked.", "SecurityError");
    }

    originalRemoveItem.call(this, key);
  });
}

describe("Privacy and local-data reset", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms watchlist clearing with safe focus and preserves analytics", () => {
    storeSavedTitle();
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });
    const clearButton = within(privacy).getByRole("button", {
      name: "Clear watchlist",
    });

    fireEvent.click(clearButton);

    let dialog = screen.getByRole("alertdialog", {
      name: "Clear saved titles?",
    });

    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(clearButton).toHaveFocus();
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).not.toBeNull();

    fireEvent.click(clearButton);

    dialog = screen.getByRole("alertdialog", {
      name: "Clear saved titles?",
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(clearButton).toHaveFocus();
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).not.toBeNull();

    fireEvent.click(clearButton);

    dialog = screen.getByRole("alertdialog", {
      name: "Clear saved titles?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clear watchlist" }),
    );

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );
    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    expect(screen.getByRole("button", { name: "Saved (0)" })).toBeEnabled();
    expect(clearButton).toBeDisabled();

    const status = screen.getByRole("status", {
      name: "Local data reset status",
    });

    expect(status).toHaveTextContent(
      "Cleared 1 saved title from this browser.",
    );
    expect(status).toHaveFocus();
  });

  it("keeps the analytics-only reset narrow while removing analytics identifiers", () => {
    storeSavedTitle();

    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

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

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Saved (1)" })).toBeEnabled();

    expect(
      screen.getByRole("heading", { name: "Help improve PickTonight?" }),
    ).toBeInTheDocument();
  });

  it("reports analytics consent reset failures without claiming persistent removal", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"declined"}',
    );

    render(<App />);

    failStorageRemovalFor(ANALYTICS_CONSENT_STORAGE_KEY);

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    fireEvent.click(
      within(privacy).getByRole("button", {
        name: "Reset analytics choice",
      }),
    );

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"declined"}',
    );

    expect(
      screen.getByRole("heading", { name: "Help improve PickTonight?" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("status", { name: "Local data reset status" }),
    ).toHaveTextContent(
      "Analytics was reset for this visit, but browser storage could not be fully updated. A previous analytics choice or identifier may remain or return after reload.",
    );
  });

  it("reports analytics identifier removal failures without claiming full deletion", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    failStorageRemovalFor(ANALYTICS_IDENTITY_STORAGE_KEY);

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
    ).not.toBeNull();

    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

    expect(
      screen.getByRole("status", { name: "Local data reset status" }),
    ).toHaveTextContent(
      "Analytics was reset for this visit, but browser storage could not be fully updated. A previous analytics choice or identifier may remain or return after reload.",
    );
  });

  it("reports watchlist clear failures without claiming persistent removal", () => {
    storeSavedTitle();
    render(<App />);

    failStorageRemovalFor(WATCHLIST_STORAGE_KEY);

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    fireEvent.click(
      within(privacy).getByRole("button", {
        name: "Clear watchlist",
      }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Clear saved titles?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clear watchlist" }),
    );

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Saved (0)" })).toBeEnabled();

    const status = screen.getByRole("status", {
      name: "Local data reset status",
    });

    expect(status).toHaveTextContent(
      "Removed 1 saved title from this visit, but browser storage could not be updated. Saved titles may return after reload.",
    );
    expect(status).toHaveFocus();
  });

  it("reports a partial complete reset without claiming full persistent deletion", () => {
    storeSavedTitle();

    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    failStorageRemovalFor(ANALYTICS_CONSENT_STORAGE_KEY);

    fireEvent.click(
      screen.getByRole("button", { name: "Reset all PickTonight data" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Reset all PickTonight data?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Reset all PickTonight data",
      }),
    );

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();

    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

    expect(screen.getByRole("button", { name: "Choose" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(screen.getByRole("button", { name: "Saved (0)" })).toBeEnabled();

    const status = screen.getByRole("status", {
      name: "Local data reset status",
    });

    expect(status).toHaveTextContent(
      "Current-session PickTonight data was reset, but browser storage could not be fully updated. Analytics choice or identifier data may remain or return after reload.",
    );
    expect(status).toHaveFocus();
  });

  it("resets only known PickTonight data, clears the session, and returns to Choose", () => {
    storeSavedTitle();

    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    window.localStorage.setItem("unrelated.site-data", "keep-me");
    window.sessionStorage.setItem("unrelated.session-data", "keep-me");

    render(<App />);

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).not.toBeNull();

    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).not.toBeNull();

    const requestField = screen.getAllByRole("textbox")[0];

    fireEvent.change(requestField, {
      target: { value: "quiet Korean drama" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Saved (1)" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Reset all PickTonight data" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Reset all PickTonight data?",
    });

    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Reset all PickTonight data",
      }),
    );

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();

    expect(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    ).toBeNull();

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();

    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();

    expect(window.localStorage.getItem("unrelated.site-data")).toBe("keep-me");

    expect(window.sessionStorage.getItem("unrelated.session-data")).toBe(
      "keep-me",
    );

    expect(screen.getByRole("button", { name: "Choose" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(screen.getByRole("button", { name: "Saved (0)" })).toBeEnabled();
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("");

    expect(
      screen.getByRole("heading", { name: "Help improve PickTonight?" }),
    ).toBeInTheDocument();

    const status = screen.getByRole("status", {
      name: "Local data reset status",
    });

    expect(status).toHaveTextContent(
      "All current PickTonight data was reset. Your active decision was also cleared.",
    );
    expect(status).toHaveFocus();
  });
});
