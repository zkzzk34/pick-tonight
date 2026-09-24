import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.hoisted(() =>
  vi.fn<(eventName: string, properties: Record<string, unknown>) => boolean>(
    () => true,
  ),
);

vi.mock("./analytics-posthog", () => ({
  captureAnalyticsEvent: captureMock,
}));

import {
  advanceRecommendationAnalyticsBatch,
  createRecommendationAnalyticsContext,
  createRecommendationItemAnalyticsReference,
  mapRecommendationFailureToAnalyticsError,
  resetAnalyticsTrackerForTests,
  trackAppOpened,
  trackConsentResponded,
  trackContextSubmitted,
  trackFeedbackSubmitted,
  trackPickerStarted,
  trackRecommendationBatchViewed,
  trackRecommendationItemShown,
  trackRecommendationOpened,
  trackRecommendationRejected,
  trackRecommendationSaved,
  trackRecommendationsRefreshed,
  trackTrailerClicked,
  trackWatchIntentConfirmed,
} from "./analytics-tracker";
import { INITIAL_PREVIEW_RECOMMENDATIONS } from "./recommendation-card-preview";

describe("Issue #36 analytics tracker", () => {
  beforeEach(() => {
    captureMock.mockReset();
    captureMock.mockReturnValue(true);
    resetAnalyticsTrackerForTests();
  });

  it("deduplicates one-time lifecycle events by their explicit keys", () => {
    expect(trackAppOpened("session-a")).toBe(true);
    expect(trackAppOpened("session-a")).toBe(false);

    expect(trackConsentResponded("session-a")).toBe(true);
    expect(trackConsentResponded("session-a")).toBe(false);

    expect(trackPickerStarted("session-a", 1)).toBe(true);
    expect(trackPickerStarted("session-a", 1)).toBe(false);
    expect(trackPickerStarted("session-a", 2)).toBe(true);

    expect(captureMock).toHaveBeenCalledTimes(4);
  });

  it("does not mark an event captured when provider delivery is unavailable", () => {
    captureMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(trackAppOpened("session-a")).toBe(false);
    expect(trackAppOpened("session-a")).toBe(true);

    expect(captureMock).toHaveBeenCalledTimes(2);
  });

  it("creates a separate recommendation-session UUID", () => {
    const context = createRecommendationAnalyticsContext("page-session");

    expect(context).not.toBeNull();
    expect(context?.analyticsSessionId).toBe("page-session");
    expect(context?.recommendationSessionId).toEqual(expect.any(String));
    expect(context?.recommendationSessionId).not.toBe("page-session");
    expect(context?.batchSequence).toBe(0);
  });

  it("tracks structured context without accepting raw preference text", () => {
    const context = createRecommendationAnalyticsContext("page-session");

    if (context === null) {
      throw new Error("Expected recommendation analytics context.");
    }

    trackContextSubmitted(context, {
      media_type_code: "movie",
      mood_code: "relaxed",
      companion_code: "partner",
      maximum_runtime_minutes: 120,
      content_language_code: "en",
      origin_country_code: "US",
      watch_region_code: "US",
      used_typed_input: true,
      required_restriction_count: 2,
      soft_preference_count: 4,
    });

    expect(captureMock).toHaveBeenCalledWith(
      "context_submitted",
      expect.objectContaining({
        recommendation_session_id: context.recommendationSessionId,
        algorithm_version: "recommendation-v4",
        used_typed_input: true,
      }),
    );

    const submittedCall = captureMock.mock.calls[0];

    if (submittedCall === undefined) {
      throw new Error("Expected context_submitted analytics capture.");
    }

    const submittedProperties = submittedCall[1];

    expect(submittedProperties).not.toHaveProperty("rawText");
    expect(submittedProperties).not.toHaveProperty("raw_text");
  });

  it("advances and deduplicates recommendation batch views", () => {
    const initial = createRecommendationAnalyticsContext("page-session");

    if (initial === null) {
      throw new Error("Expected recommendation analytics context.");
    }

    const firstBatch = advanceRecommendationAnalyticsBatch(initial);

    expect(firstBatch.batchSequence).toBe(1);

    expect(trackRecommendationBatchViewed(firstBatch, 3)).toBe(true);
    expect(trackRecommendationBatchViewed(firstBatch, 3)).toBe(false);

    const secondBatch = advanceRecommendationAnalyticsBatch(firstBatch);

    expect(trackRecommendationBatchViewed(secondBatch, 3)).toBe(true);
  });

  it("captures the eight reviewed recommendation-decision events without title identity", () => {
    const context = createRecommendationAnalyticsContext("page-session");
    const recommendation = INITIAL_PREVIEW_RECOMMENDATIONS[0];
    const item = createRecommendationItemAnalyticsReference(recommendation, 2);

    if (context === null || item === null) {
      throw new Error("Expected analytics references.");
    }

    const activeContext = advanceRecommendationAnalyticsBatch(context);

    trackRecommendationItemShown(activeContext, item, 1, "first-shown");
    trackRecommendationOpened(activeContext, item);
    trackTrailerClicked(activeContext, item);
    trackRecommendationSaved(activeContext, item, "persistent");
    trackRecommendationRejected(activeContext, item, "not-my-taste");
    trackRecommendationsRefreshed(activeContext, item);
    trackWatchIntentConfirmed(activeContext, item);
    trackFeedbackSubmitted(activeContext, item, "wrong-mood", "not-my-taste");

    expect(captureMock.mock.calls.map(([eventName]) => eventName)).toEqual([
      "recommendation_item_shown",
      "recommendation_opened",
      "trailer_clicked",
      "recommendation_saved",
      "recommendation_rejected",
      "recommendations_refreshed",
      "watch_intent_confirmed",
      "feedback_submitted",
    ]);

    for (const [, properties] of captureMock.mock.calls) {
      expect(properties).not.toHaveProperty("title");
      expect(properties).not.toHaveProperty("mediaKey");
      expect(properties).not.toHaveProperty("media_key");
      expect(properties).not.toHaveProperty("tmdb_id");
      expect(properties).not.toHaveProperty("freeText");
      expect(properties).not.toHaveProperty("free_text");
    }

    expect(captureMock).toHaveBeenCalledWith(
      "recommendation_item_shown",
      expect.objectContaining({
        recommendation_item_id: item.recommendationItemId,
        batch_sequence: 1,
        impression_sequence: 1,
        candidate_age_code: "established",
        rating_confidence_code: "strong",
        provider_claim_status: "not-claimed",
        repeat_status: "first-shown",
      }),
    );

    expect(captureMock).toHaveBeenCalledWith(
      "recommendation_opened",
      expect.objectContaining({
        recommendation_item_id: item.recommendationItemId,
        media_type: "movie",
        position: 2,
      }),
    );

    expect(captureMock).toHaveBeenCalledWith(
      "recommendations_refreshed",
      expect.objectContaining({
        recommendation_item_id: item.recommendationItemId,
        position: 2,
        batch_sequence: 1,
      }),
    );
  });

  it("derives provider claims only from usable availability evidence", () => {
    const recommendation = INITIAL_PREVIEW_RECOMMENDATIONS[0];
    const claimedItem = createRecommendationItemAnalyticsReference(
      {
        ...recommendation,
        providerAvailability: {
          source: "justwatch",
          watchRegion: "US",
          providerNames: ["Example provider"],
        },
      },
      1,
    );
    const blankProviderItem = createRecommendationItemAnalyticsReference(
      {
        ...recommendation,
        providerAvailability: {
          source: "justwatch",
          watchRegion: "US",
          providerNames: ["   "],
        },
      },
      1,
    );

    expect(claimedItem?.providerClaimStatus).toBe("claimed");
    expect(blankProviderItem?.providerClaimStatus).toBe("not-claimed");
  });

  it("maps request failures to bounded analytics error categories", () => {
    expect(mapRecommendationFailureToAnalyticsError("timeout")).toBe("network");
    expect(mapRecommendationFailureToAnalyticsError("validation")).toBe(
      "invalid-response",
    );
    expect(mapRecommendationFailureToAnalyticsError("authentication")).toBe(
      "upstream",
    );
    expect(mapRecommendationFailureToAnalyticsError("upstream")).toBe(
      "upstream",
    );
  });
});
