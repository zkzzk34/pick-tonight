import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecommendationRequest } from "../shared/recommendation-contracts";

const analyticsMocks = vi.hoisted(() => ({
  empty: vi.fn(() => true),
  batch: vi.fn(() => true),
  error: vi.fn(() => true),
}));

vi.mock("./analytics-tracker", () => ({
  advanceRecommendationAnalyticsBatch: vi.fn(),
  createRecommendationAnalyticsContext: vi.fn((analyticsSessionId: string) => ({
    analyticsSessionId,
    recommendationSessionId: "22222222-2222-4222-8222-222222222222",
    batchSequence: 0,
  })),
  mapRecommendationFailureToAnalyticsError: vi.fn(() => "unknown"),
  trackApiErrorShown: analyticsMocks.error,
  trackContextSubmitted: vi.fn(() => true),
  trackRecommendationBatchViewed: analyticsMocks.batch,
  trackRecommendationEmptyShown: analyticsMocks.empty,
}));

import { RecommendationRequestPanel } from "./recommendation-request-panel";
import type { RecommendationRequester } from "./recommendation-request-state";

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

describe("Issue #35 recommendation request analytics lifecycle", () => {
  beforeEach(() => {
    analyticsMocks.empty.mockClear();
    analyticsMocks.batch.mockClear();
    analyticsMocks.error.mockClear();
  });

  it("records an empty result once and does not count it as a viewed batch", async () => {
    const requester = vi.fn<RecommendationRequester>(async () => ({
      status: "empty",
    }));

    render(
      <RecommendationRequestPanel
        analyticsSessionId="11111111-1111-4111-8111-111111111111"
        requestRecommendations={requester}
        submittedPreferences={SUBMITTED_PREFERENCES}
      >
        {() => <div>Unexpected recommendation content</div>}
      </RecommendationRequestPanel>,
    );

    fireEvent.submit(
      screen.getByRole("form", {
        name: "Recommendation request controls",
      }),
    );

    expect(
      await screen.findByText("No eligible recommendations"),
    ).toBeInTheDocument();

    expect(analyticsMocks.empty).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.batch).not.toHaveBeenCalled();
    expect(analyticsMocks.error).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Unexpected recommendation content"),
    ).not.toBeInTheDocument();
  });
});
