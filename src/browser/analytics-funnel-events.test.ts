import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_TAXONOMY_VERSION } from "./analytics-events";

const analyticsCapture = vi.hoisted(() =>
  vi.fn<(eventName: string, properties: Record<string, unknown>) => boolean>(
    () => true,
  ),
);

vi.mock("./analytics-posthog", () => ({
  captureAnalyticsEvent: analyticsCapture,
}));

import type { RecommendationAnalyticsContext } from "./analytics-tracker";
import {
  resetAnalyticsTrackerForTests,
  trackRecommendationEmptyShown,
} from "./analytics-tracker";

const CONTEXT: RecommendationAnalyticsContext = {
  analyticsSessionId: "11111111-1111-4111-8111-111111111111",
  recommendationSessionId: "22222222-2222-4222-8222-222222222222",
  batchSequence: 0,
};

describe("Issue #35 picker-funnel analytics events", () => {
  beforeEach(() => {
    analyticsCapture.mockReset();
    analyticsCapture.mockReturnValue(true);
    resetAnalyticsTrackerForTests();
  });

  it("emits a recommendation-scoped empty-result event without batch semantics", () => {
    expect(trackRecommendationEmptyShown(CONTEXT)).toBe(true);

    expect(analyticsCapture).toHaveBeenCalledTimes(1);
    expect(analyticsCapture).toHaveBeenCalledWith(
      "recommendation_empty_shown",
      {
        taxonomy_version: ANALYTICS_TAXONOMY_VERSION,
        ui_locale: "en-US",
        analytics_environment: "test",
        traffic_class: "internal",
        session_id: CONTEXT.analyticsSessionId,
        recommendation_session_id: CONTEXT.recommendationSessionId,
        algorithm_version: "recommendation-v4",
      },
    );

    expect(
      analyticsCapture.mock.calls.some(
        ([eventName]) => eventName === "recommendation_batch_viewed",
      ),
    ).toBe(false);
  });
});
