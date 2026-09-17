import { describe, expect, it } from "vitest";

import { RECOMMENDATION_HEURISTIC_VERSION } from "../shared/recommendation-version";
import {
  ANALYTICS_TAXONOMY_VERSION,
  ANALYTICS_UI_LOCALE,
  PICKTONIGHT_ANALYTICS_EVENT_NAMES,
  createAnalyticsBaseProperties,
  createRecommendationScopedProperties,
  isPickTonightAnalyticsEventName,
} from "./analytics-events";

describe("Issue #33 analytics event contract", () => {
  it("defines exactly the reviewed product event vocabulary", () => {
    expect(PICKTONIGHT_ANALYTICS_EVENT_NAMES).toEqual([
      "app_opened",
      "consent_responded",
      "picker_started",
      "picker_step_completed",
      "picker_abandoned",
      "context_submitted",
      "recommendation_batch_viewed",
      "recommendation_opened",
      "trailer_clicked",
      "recommendation_saved",
      "recommendation_rejected",
      "recommendations_refreshed",
      "watch_intent_confirmed",
      "feedback_submitted",
      "api_error_shown",
    ]);
  });

  it("accepts only exact reviewed event names", () => {
    for (const eventName of PICKTONIGHT_ANALYTICS_EVENT_NAMES) {
      expect(isPickTonightAnalyticsEventName(eventName)).toBe(true);
    }

    expect(isPickTonightAnalyticsEventName("$pageview")).toBe(false);
    expect(isPickTonightAnalyticsEventName("$autocapture")).toBe(false);
    expect(isPickTonightAnalyticsEventName("$exception")).toBe(false);
    expect(
      isPickTonightAnalyticsEventName("picktonight_unreviewed_event"),
    ).toBe(false);
    expect(isPickTonightAnalyticsEventName("recommendation-opened")).toBe(
      false,
    );
  });

  it("creates the minimal shared base contract", () => {
    expect(createAnalyticsBaseProperties("analytics-session")).toEqual({
      taxonomy_version: ANALYTICS_TAXONOMY_VERSION,
      ui_locale: ANALYTICS_UI_LOCALE,
      session_id: "analytics-session",
    });
  });

  it("uses the shared recommendation algorithm version", () => {
    expect(
      createRecommendationScopedProperties(
        "analytics-session",
        "recommendation-session",
      ),
    ).toEqual({
      taxonomy_version: 1,
      ui_locale: "en-US",
      session_id: "analytics-session",
      recommendation_session_id: "recommendation-session",
      algorithm_version: RECOMMENDATION_HEURISTIC_VERSION,
    });

    expect(RECOMMENDATION_HEURISTIC_VERSION).toBe("recommendation-v3");
  });
});
