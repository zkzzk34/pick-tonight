import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  capture: vi.fn<
    (eventName: string, properties: Record<string, unknown>) => boolean
  >(() => true),
  deactivate: vi.fn(),
}));

vi.mock("./analytics-posthog", () => ({
  activateDevelopmentAnalytics: providerMocks.activate,
  captureDevelopmentAnalyticsEvent: providerMocks.capture,
  deactivateDevelopmentAnalytics: providerMocks.deactivate,
}));

import App from "./App";
import { resetAnalyticsTrackerForTests } from "./analytics-tracker";
import {
  ANALYTICS_IDENTITY_STORAGE_KEY,
  ANALYTICS_SESSION_STORAGE_KEY,
} from "./analytics-identity-storage";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "./analytics-consent-storage";

describe("App development analytics provider lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    providerMocks.activate.mockReset();
    providerMocks.capture.mockReset();
    providerMocks.capture.mockReturnValue(true);
    providerMocks.deactivate.mockReset();
    resetAnalyticsTrackerForTests();
  });

  it("never activates the provider before consent", async () => {
    render(<App />);

    await waitFor(() => {
      expect(providerMocks.deactivate).toHaveBeenCalled();
    });

    expect(providerMocks.activate).not.toHaveBeenCalled();
    expect(providerMocks.capture).not.toHaveBeenCalled();

    expect(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY),
    ).toBeNull();

    expect(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY),
    ).toBeNull();
  });

  it("activates only after accepted consent and ready PickTonight identifiers", async () => {
    render(<App />);

    providerMocks.activate.mockClear();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Allow analytics",
      }),
    );

    await waitFor(() => {
      expect(providerMocks.activate).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );

    const browserRecord = JSON.parse(
      window.localStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY) ?? "null",
    ) as { id?: unknown } | null;

    const sessionRecord = JSON.parse(
      window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY) ?? "null",
    ) as { id?: unknown } | null;

    expect(providerMocks.activate).toHaveBeenCalledWith({
      browserId: browserRecord?.id,
      sessionId: sessionRecord?.id,
    });

    expect(providerMocks.capture).toHaveBeenCalledWith(
      "consent_responded",
      expect.objectContaining({
        session_id: sessionRecord?.id,
        response: "accepted",
      }),
    );

    expect(providerMocks.capture).toHaveBeenCalledWith(
      "app_opened",
      expect.objectContaining({
        session_id: sessionRecord?.id,
      }),
    );
  });

  it("does not replay recommendation activity that occurred before consent", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/Tell PickTonight what you want/i), {
      target: { value: "funny movie" },
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

    await screen.findByRole("region", {
      name: "3 picks for tonight",
    });

    expect(providerMocks.capture).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Allow analytics",
      }),
    );

    await waitFor(() => {
      expect(providerMocks.activate).toHaveBeenCalledTimes(1);
    });

    expect(
      providerMocks.capture.mock.calls.map(([eventName]) => eventName),
    ).toEqual(["consent_responded", "app_opened"]);
  });

  it("restores accepted consent and activates from restored identifiers", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    await waitFor(() => {
      expect(providerMocks.activate).toHaveBeenCalledTimes(1);
    });

    const call = providerMocks.activate.mock.calls[0][0] as {
      browserId?: unknown;
      sessionId?: unknown;
    };

    expect(call.browserId).toEqual(expect.any(String));
    expect(call.sessionId).toEqual(expect.any(String));

    expect(providerMocks.capture).toHaveBeenCalledWith(
      "app_opened",
      expect.objectContaining({
        session_id: call.sessionId,
      }),
    );

    expect(
      providerMocks.capture.mock.calls.some(
        ([eventName]) => eventName === "consent_responded",
      ),
    ).toBe(false);
  });

  it("deactivates immediately when analytics is reset", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    await waitFor(() => {
      expect(providerMocks.activate).toHaveBeenCalledTimes(1);
    });

    providerMocks.deactivate.mockClear();

    const privacy = screen.getByRole("region", {
      name: "Your choice stays separate from your picks.",
    });

    fireEvent.click(
      within(privacy).getByRole("button", {
        name: "Reset analytics choice",
      }),
    );

    expect(providerMocks.deactivate).toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Help improve PickTonight?",
        }),
      ).toBeInTheDocument();
    });
  });

  it("deactivates immediately during the complete PickTonight reset", async () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      '{"version":1,"choice":"accepted"}',
    );

    render(<App />);

    await waitFor(() => {
      expect(providerMocks.activate).toHaveBeenCalledTimes(1);
    });

    providerMocks.deactivate.mockClear();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset all PickTonight data",
      }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Reset all PickTonight data?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Reset all PickTonight data",
      }),
    );

    expect(providerMocks.deactivate).toHaveBeenCalled();
  });

  it("does not activate when accepted consent cannot establish identifiers", async () => {
    const originalSetItem = Storage.prototype.setItem;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === ANALYTICS_IDENTITY_STORAGE_KEY) {
        throw new DOMException("Storage unavailable.", "SecurityError");
      }

      originalSetItem.call(this, key, value);
    });

    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Allow analytics",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/optional analytics remain unavailable/i),
      ).toBeInTheDocument();
    });

    expect(providerMocks.activate).not.toHaveBeenCalled();
  });
});
