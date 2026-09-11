import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import type { RecommendationCardSet } from "./recommendation-card-model";
import { INITIAL_PREVIEW_RECOMMENDATIONS } from "./recommendation-card-preview";
import { RecommendationRequestPanel } from "./recommendation-request-panel";
import type {
  RecommendationFailureKind,
  RecommendationRequester,
  RecommendationRequestResult,
} from "./recommendation-request-state";

const SUBMITTED_PREFERENCES = {
  hardRestrictions: {
    mediaType: "movie",
    excludedGenreIds: [27],
    maximumRuntimeMinutes: 120,
    requiredProviderIds: [8],
  },
  softPreferences: {
    mood: "laughing",
    preferredGenreIds: [35],
    contentLanguage: "en",
    originCountry: "US",
  },
  watchRegion: "US",
} satisfies RecommendationRequest;

const FAILURE_CASES = [
  {
    failure: "validation",
    title: "Check your preferences",
    message:
      "Some submitted preferences could not be used. Review them and try again.",
  },
  {
    failure: "authentication",
    title: "Recommendations are temporarily unavailable",
    message:
      "PickTonight cannot securely access recommendation data right now. Try again later.",
  },
  {
    failure: "timeout",
    title: "The request took too long",
    message:
      "PickTonight could not finish in time. Try the same preferences again.",
  },
  {
    failure: "upstream",
    title: "Recommendations are temporarily unavailable",
    message: "PickTonight could not finish this request. Try again shortly.",
  },
] as const satisfies readonly {
  readonly failure: RecommendationFailureKind;
  readonly title: string;
  readonly message: string;
}[];

function deferredResult(): {
  readonly promise: Promise<RecommendationRequestResult>;
  readonly resolve: (result: RecommendationRequestResult) => void;
} {
  let resolve: (result: RecommendationRequestResult) => void = () => undefined;
  const promise = new Promise<RecommendationRequestResult>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function renderPanel({
  requester,
  preferences = structuredClone(SUBMITTED_PREFERENCES),
  initialRecommendations,
}: {
  readonly requester: RecommendationRequester;
  readonly preferences?: RecommendationRequest;
  readonly initialRecommendations?: RecommendationCardSet;
}): void {
  render(
    <RecommendationRequestPanel
      initialRecommendations={initialRecommendations}
      requestRecommendations={requester}
      submittedPreferences={preferences}
    >
      {(recommendations) => (
        <ol aria-label="Rendered recommendations">
          {recommendations.map(({ mediaKey, title }) => (
            <li key={mediaKey}>{title}</li>
          ))}
        </ol>
      )}
    </RecommendationRequestPanel>,
  );
}

function submitRequest(): void {
  fireEvent.submit(
    screen.getByRole("form", { name: "Recommendation request controls" }),
  );
}

describe("RecommendationRequestPanel", () => {
  it("announces loading, marks results busy, and blocks duplicate submissions", async () => {
    const pending = deferredResult();
    const requester = vi.fn<RecommendationRequester>(() => pending.promise);

    renderPanel({
      requester,
      initialRecommendations: INITIAL_PREVIEW_RECOMMENDATIONS,
    });

    const requestRegion = screen.getByRole("region", {
      name: "Recommendation request",
    });
    const resultsGroup = screen.getByRole("group", {
      name: "Recommendation results",
    });

    expect(requestRegion).toContainElement(resultsGroup);

    expect(
      screen.getByRole("list", { name: "Rendered recommendations" }),
    ).toBeInTheDocument();

    submitRequest();
    submitRequest();

    expect(requester).toHaveBeenCalledTimes(1);
    expect(requestRegion).not.toHaveAttribute("aria-busy");
    expect(resultsGroup).toHaveAttribute("aria-busy", "true");

    const requestStatus = screen.getByRole("status", {
      name: "Recommendation request status",
    });
    expect(requestStatus).toHaveTextContent("Finding your picks");
    expect(resultsGroup).not.toContainElement(requestStatus);
    expect(
      screen.getByRole("button", {
        name: "Requesting recommendations…",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("list", { name: "Rendered recommendations" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve({
        status: "complete",
        recommendations: INITIAL_PREVIEW_RECOMMENDATIONS,
      });
    });

    expect(
      screen.getByRole("list", { name: "Rendered recommendations" }),
    ).toBeInTheDocument();
    expect(resultsGroup).toHaveAttribute("aria-busy", "false");
    expect(
      screen.getByRole("button", { name: "Request recommendations" }),
    ).toBeEnabled();
  });

  it("explains an honestly empty result without rendering cards", async () => {
    const requester = vi.fn<RecommendationRequester>(async () => ({
      status: "empty",
    }));

    renderPanel({ requester });
    submitRequest();

    expect(
      await screen.findByText("No eligible recommendations"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No titles matched all of the submitted restrictions.",
    );
    expect(
      screen.queryByRole("list", { name: "Rendered recommendations" }),
    ).not.toBeInTheDocument();
  });

  it.each(FAILURE_CASES)(
    "renders fixed user-safe copy for $failure failures",
    async ({ failure, title, message }) => {
      const requester = vi.fn<RecommendationRequester>(async () => ({
        status: "error",
        failure,
      }));

      renderPanel({ requester });
      submitRequest();

      const alert = screen.getByRole("alert");
      await waitFor(() => expect(alert).toHaveTextContent(title));
      expect(alert).toHaveTextContent(message);
      expect(
        screen.getByRole("button", { name: "Retry same preferences" }),
      ).toBeEnabled();
    },
  );

  it("uses fixed upstream copy when a requester throws unsafe details", async () => {
    const unsafeDetail = "secret-token stack trace /private/server/path";
    const requester = vi.fn<RecommendationRequester>(async () => {
      throw new Error(unsafeDetail);
    });

    renderPanel({ requester });
    submitRequest();

    const alert = screen.getByRole("alert");
    await waitFor(() =>
      expect(alert).toHaveTextContent(
        "PickTonight could not finish this request. Try again shortly.",
      ),
    );
    expect(document.body).not.toHaveTextContent(unsafeDetail);
  });

  it("retries the detached snapshot of the last submitted preferences", async () => {
    const preferences = structuredClone(SUBMITTED_PREFERENCES);
    const expectedSnapshot = structuredClone(preferences);
    const requester = vi
      .fn<RecommendationRequester>()
      .mockResolvedValueOnce({ status: "error", failure: "timeout" })
      .mockResolvedValueOnce({
        status: "complete",
        recommendations: INITIAL_PREVIEW_RECOMMENDATIONS,
      });

    renderPanel({ requester, preferences });
    submitRequest();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The request took too long",
      ),
    );

    preferences.watchRegion = "CA";
    preferences.hardRestrictions?.excludedGenreIds?.push(53);
    preferences.softPreferences?.preferredGenreIds?.push(12);

    fireEvent.click(
      screen.getByRole("button", { name: "Retry same preferences" }),
    );

    expect(
      await screen.findByRole("list", { name: "Rendered recommendations" }),
    ).toBeInTheDocument();
    expect(requester).toHaveBeenCalledTimes(2);
    expect(requester.mock.calls[0]?.[0]).toEqual(expectedSnapshot);
    expect(requester.mock.calls[1]?.[0]).toEqual(expectedSnapshot);
    expect(requester.mock.calls[1]?.[0]).not.toBe(requester.mock.calls[0]?.[0]);
  });
});
