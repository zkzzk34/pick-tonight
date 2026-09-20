import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyticsCapture = vi.hoisted(() =>
  vi.fn<(eventName: string, properties: Record<string, unknown>) => boolean>(
    () => true,
  ),
);

vi.mock("./analytics-posthog", () => ({
  captureDevelopmentAnalyticsEvent: analyticsCapture,
}));

import type { RecommendationAnalyticsContext } from "./analytics-tracker";
import { FeedbackRecommendationExperience } from "./feedback-recommendation-experience";
import type { SaveToWatchlist } from "./local-watchlist";
import {
  INITIAL_PREVIEW_RECOMMENDATIONS,
  PREVIEW_REPLACEMENT_POOL,
} from "./recommendation-card-preview";
import type { RecommendationCardSet } from "./recommendation-card-model";

const TEST_RECOMMENDATIONS = [
  {
    ...INITIAL_PREVIEW_RECOMMENDATIONS[0],
    mediaKey: "analytics-test:movie-a",
    title: "Analytics test movie A",
    trailerUrl: "https://example.com/analytics-test-trailer-a",
  },
  {
    ...INITIAL_PREVIEW_RECOMMENDATIONS[1],
    mediaKey: "analytics-test:tv-b",
    title: "Analytics test television B",
  },
  {
    ...INITIAL_PREVIEW_RECOMMENDATIONS[2],
    mediaKey: "analytics-test:movie-c",
    title: "Analytics test movie C",
  },
] as const satisfies RecommendationCardSet;

const ANALYTICS_CONTEXT: RecommendationAnalyticsContext = {
  analyticsSessionId: "analytics-session",
  recommendationSessionId: "recommendation-session",
  batchSequence: 1,
};

function DecisionHarness({
  onSaveTitle,
}: {
  readonly onSaveTitle: SaveToWatchlist;
}) {
  const [recommendations, setRecommendations] =
    useState<RecommendationCardSet>(TEST_RECOMMENDATIONS);

  return (
    <FeedbackRecommendationExperience
      analyticsContext={ANALYTICS_CONTEXT}
      onEditRequiredRestrictions={() => undefined}
      onSaveTitle={onSaveTitle}
      onStatusMessage={() => undefined}
      recommendations={recommendations}
      replacementPool={PREVIEW_REPLACEMENT_POOL}
      updateRecommendations={(update) =>
        setRecommendations((current) => update(current))
      }
    />
  );
}

function ExposureLifecycleHarness() {
  const [recommendations, setRecommendations] =
    useState<RecommendationCardSet>(TEST_RECOMMENDATIONS);
  const [recommendationSessionId, setRecommendationSessionId] =
    useState<string>(ANALYTICS_CONTEXT.recommendationSessionId);

  return (
    <>
      <button
        onClick={() =>
          setRecommendations((current) => [current[1], current[1], current[2]])
        }
        type="button"
      >
        Inject repeated recommendation
      </button>
      <button
        onClick={() => setRecommendationSessionId("next-journey")}
        type="button"
      >
        Start next recommendation journey
      </button>
      <FeedbackRecommendationExperience
        analyticsContext={{
          ...ANALYTICS_CONTEXT,
          recommendationSessionId,
        }}
        onEditRequiredRestrictions={() => undefined}
        onSaveTitle={() => ({
          outcome: "added",
          persistence: "session-only",
        })}
        onStatusMessage={() => undefined}
        recommendations={recommendations}
        updateRecommendations={(update) =>
          setRecommendations((current) => update(current))
        }
      />
    </>
  );
}

function eventNames(): string[] {
  return analyticsCapture.mock.calls.map(([eventName]) => eventName);
}

function propertiesFor(eventName: string): Record<string, unknown>[] {
  return analyticsCapture.mock.calls
    .filter(([capturedEvent]) => capturedEvent === eventName)
    .map(([, properties]) => properties);
}

describe("Issue #36 recommendation decision analytics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    analyticsCapture.mockReset();
    analyticsCapture.mockReturnValue(true);
  });

  it("fires the eight decision events with opaque, privacy-bounded properties", () => {
    let saveAttempts = 0;

    const onSaveTitle: SaveToWatchlist = () => {
      saveAttempts += 1;

      return saveAttempts === 1
        ? {
            outcome: "added",
            persistence: "persistent",
          }
        : {
            outcome: "already-saved",
            persistence: "persistent",
          };
    };

    render(<DecisionHarness onSaveTitle={onSaveTitle} />);

    // Trailer directly from the recommendation card.
    fireEvent.click(
      screen.getByRole("link", {
        name: "Watch trailer for Analytics test movie A",
      }),
    );

    // Open details.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Details: Analytics test movie A",
      }),
    );

    // This custom media key is not in the preview detail fixture, so the
    // component's fallback detail carries the recommendation's trailer URL.
    fireEvent.click(
      screen.getByRole("link", {
        name: /Watch trailer for Analytics test movie A/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to 3 picks",
      }),
    );

    // First save succeeds. Second is an already-saved no-op.
    const saveButton = screen.getByRole("button", {
      name: "Save: Analytics test television B",
    });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    // Explicit watch intent.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose tonight: Analytics test movie C",
      }),
    );

    // Explicit neutral replacement.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Analytics test movie A",
      }),
    );

    // Submit free-form structured feedback. The text must stay out of analytics.
    const feedbackPanel = screen.getByRole("region", {
      name: "Optional feedback for Analytics test movie A",
    });

    fireEvent.click(
      within(feedbackPanel).getByRole("button", {
        name: "Something else",
      }),
    );

    const privateFeedback = "This sentence must never enter analytics.";

    fireEvent.change(within(feedbackPanel).getByLabelText(/Something else/i), {
      target: {
        value: privateFeedback,
      },
    });

    fireEvent.click(
      within(feedbackPanel).getByRole("button", {
        name: "Save reason for this session",
      }),
    );

    // Rejection-driven replacement.
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Analytics test television B",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Not tonight: Analytics test television B",
      }),
    );

    for (const expectedEvent of [
      "recommendation_item_shown",
      "recommendation_opened",
      "trailer_clicked",
      "recommendation_saved",
      "recommendation_rejected",
      "recommendations_refreshed",
      "watch_intent_confirmed",
      "feedback_submitted",
    ]) {
      expect(eventNames()).toContain(expectedEvent);
    }

    expect(propertiesFor("recommendation_item_shown")).toHaveLength(5);
    expect(propertiesFor("recommendation_item_shown")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impression_sequence: 1,
          candidate_age_code: "established",
          rating_confidence_code: "strong",
          provider_claim_status: "not-claimed",
          repeat_status: "first-shown",
        }),
        expect.objectContaining({
          impression_sequence: 3,
          candidate_age_code: "unknown",
          rating_confidence_code: "limited",
        }),
      ]),
    );

    // Card + detail trailer interactions are both deliberate events.
    expect(
      eventNames().filter((eventName) => eventName === "trailer_clicked"),
    ).toHaveLength(2);

    // Already-saved does not create a second save event.
    expect(propertiesFor("recommendation_saved")).toHaveLength(1);

    // Rejection-driven replacement does not double-count neutral refresh.
    expect(propertiesFor("recommendations_refreshed")).toHaveLength(1);

    expect(propertiesFor("recommendations_refreshed")[0]).toEqual(
      expect.objectContaining({
        batch_sequence: 1,
        position: 1,
      }),
    );

    expect(propertiesFor("recommendation_rejected")).toContainEqual(
      expect.objectContaining({
        rejection_reason: "not-tonight",
      }),
    );

    expect(propertiesFor("feedback_submitted")).toContainEqual(
      expect.objectContaining({
        feedback_reason: "other",
        originating_action: "replace",
      }),
    );

    for (const [, properties] of analyticsCapture.mock.calls) {
      expect(properties).not.toHaveProperty("title");
      expect(properties).not.toHaveProperty("mediaKey");
      expect(properties).not.toHaveProperty("media_key");
      expect(properties).not.toHaveProperty("tmdb_id");
      expect(properties).not.toHaveProperty("posterUrl");
      expect(properties).not.toHaveProperty("overview");
      expect(properties).not.toHaveProperty("freeText");
      expect(properties).not.toHaveProperty("free_text");

      expect(JSON.stringify(properties)).not.toContain(privateFeedback);
      expect(JSON.stringify(properties)).not.toContain(
        "Analytics test movie A",
      );
      expect(JSON.stringify(properties)).not.toContain(
        "Analytics test television B",
      );
      expect(JSON.stringify(properties)).not.toContain(
        "Analytics test movie C",
      );
    }

    const opaqueItemIds = analyticsCapture.mock.calls
      .map(([, properties]) => properties.recommendation_item_id)
      .filter((value): value is string => typeof value === "string");

    expect(opaqueItemIds.length).toBeGreaterThan(0);

    for (const itemId of opaqueItemIds) {
      expect(itemId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      expect(itemId).not.toContain("analytics-test:");
    }
  });

  it("marks an unexpectedly repeated title without sending its identity", () => {
    render(<ExposureLifecycleHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Inject repeated recommendation",
      }),
    );

    const shownEvents = propertiesFor("recommendation_item_shown");
    const firstTelevisionExposure = shownEvents.find(
      (properties) => properties.impression_sequence === 2,
    );
    const repeatedExposure = shownEvents.find(
      (properties) => properties.impression_sequence === 4,
    );

    expect(firstTelevisionExposure).toEqual(
      expect.objectContaining({
        position: 2,
        repeat_status: "first-shown",
      }),
    );
    expect(repeatedExposure).toEqual(
      expect.objectContaining({
        position: 1,
        repeat_status: "repeated",
        recommendation_item_id: firstTelevisionExposure?.recommendation_item_id,
      }),
    );
    expect(repeatedExposure).not.toHaveProperty("mediaKey");
    expect(repeatedExposure).not.toHaveProperty("title");
  });

  it("resets item identity and first-shown state for a new journey", () => {
    render(<ExposureLifecycleHarness />);

    const firstJourneyEvents = propertiesFor("recommendation_item_shown");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Start next recommendation journey",
      }),
    );

    const allShownEvents = propertiesFor("recommendation_item_shown");
    const nextJourneyEvents = allShownEvents.slice(firstJourneyEvents.length);

    expect(firstJourneyEvents).toHaveLength(3);
    expect(nextJourneyEvents).toHaveLength(3);
    expect(nextJourneyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendation_session_id: "next-journey",
          impression_sequence: 1,
          repeat_status: "first-shown",
        }),
      ]),
    );
    expect(
      new Set(
        firstJourneyEvents.map(
          (properties) => properties.recommendation_item_id,
        ),
      ),
    ).not.toEqual(
      new Set(
        nextJourneyEvents.map(
          (properties) => properties.recommendation_item_id,
        ),
      ),
    );
  });
});
