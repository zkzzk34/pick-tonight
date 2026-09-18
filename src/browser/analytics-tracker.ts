import type { RecommendationFailureKind } from "./recommendation-request-state";
import {
  createAnalyticsBaseProperties,
  createRecommendationScopedProperties,
  type ApiErrorKind,
  type ContextSummaryProperties,
  type PickerAbandonmentReason,
  type RecommendationMediaType,
  type RecommendationRejectionReason,
} from "./analytics-events";
import type {
  FeedbackReasonCode,
  ReplacementFeedbackAction,
} from "./feedback-session";
import { generateAnalyticsId } from "./analytics-identity-storage";
import { captureDevelopmentAnalyticsEvent } from "./analytics-posthog";

export interface RecommendationAnalyticsContext {
  readonly analyticsSessionId: string;
  readonly recommendationSessionId: string;
  readonly batchSequence: number;
}

export interface RecommendationItemAnalyticsReference {
  readonly recommendationItemId: string;
  readonly mediaType: RecommendationMediaType;
  readonly position: number;
}

const capturedOnceKeys = new Set<string>();

function captureOnce(key: string, capture: () => boolean): boolean {
  if (capturedOnceKeys.has(key)) {
    return false;
  }

  const captured = capture();

  if (captured) {
    capturedOnceKeys.add(key);
  }

  return captured;
}

export function trackAppOpened(sessionId: string): boolean {
  return captureOnce(`app_opened:${sessionId}`, () =>
    captureDevelopmentAnalyticsEvent(
      "app_opened",
      createAnalyticsBaseProperties(sessionId),
    ),
  );
}

export function trackConsentResponded(sessionId: string): boolean {
  return captureOnce(`consent_responded:${sessionId}`, () =>
    captureDevelopmentAnalyticsEvent("consent_responded", {
      ...createAnalyticsBaseProperties(sessionId),
      response: "accepted",
    }),
  );
}

export function trackPickerStarted(
  sessionId: string,
  attemptKey: number,
): boolean {
  return captureOnce(`picker_started:${sessionId}:${attemptKey}`, () =>
    captureDevelopmentAnalyticsEvent(
      "picker_started",
      createAnalyticsBaseProperties(sessionId),
    ),
  );
}

export function trackPickerStepCompleted(
  sessionId: string,
  attemptKey: number,
): boolean {
  return captureOnce(
    `picker_step_completed:${sessionId}:${attemptKey}:preferences_reviewed`,
    () =>
      captureDevelopmentAnalyticsEvent("picker_step_completed", {
        ...createAnalyticsBaseProperties(sessionId),
        step: "preferences_reviewed",
      }),
  );
}

export function trackPickerAbandoned(
  sessionId: string,
  attemptKey: number,
  reason: PickerAbandonmentReason,
): boolean {
  return captureOnce(`picker_abandoned:${sessionId}:${attemptKey}`, () =>
    captureDevelopmentAnalyticsEvent("picker_abandoned", {
      ...createAnalyticsBaseProperties(sessionId),
      reason,
    }),
  );
}

export function createRecommendationAnalyticsContext(
  analyticsSessionId: string,
): RecommendationAnalyticsContext | null {
  const recommendationSessionId = generateAnalyticsId();

  if (recommendationSessionId === null) {
    return null;
  }

  return {
    analyticsSessionId,
    recommendationSessionId,
    batchSequence: 0,
  };
}

export function advanceRecommendationAnalyticsBatch(
  context: RecommendationAnalyticsContext,
): RecommendationAnalyticsContext {
  return {
    ...context,
    batchSequence: context.batchSequence + 1,
  };
}

export function trackContextSubmitted(
  context: RecommendationAnalyticsContext,
  summary: ContextSummaryProperties,
): boolean {
  return captureOnce(
    `context_submitted:${context.recommendationSessionId}`,
    () =>
      captureDevelopmentAnalyticsEvent("context_submitted", {
        ...createRecommendationScopedProperties(
          context.analyticsSessionId,
          context.recommendationSessionId,
        ),
        ...summary,
      }),
  );
}

export function trackRecommendationBatchViewed(
  context: RecommendationAnalyticsContext,
  recommendationCount: number,
): boolean {
  return captureOnce(
    `recommendation_batch_viewed:${context.recommendationSessionId}:${context.batchSequence}`,
    () =>
      captureDevelopmentAnalyticsEvent("recommendation_batch_viewed", {
        ...createRecommendationScopedProperties(
          context.analyticsSessionId,
          context.recommendationSessionId,
        ),
        batch_sequence: context.batchSequence,
        recommendation_count: recommendationCount,
      }),
  );
}

export function mapRecommendationFailureToAnalyticsError(
  failure: RecommendationFailureKind,
): ApiErrorKind {
  if (failure === "timeout") {
    return "network";
  }

  if (failure === "validation") {
    return "invalid-response";
  }

  return "upstream";
}

export function trackApiErrorShown(
  context: RecommendationAnalyticsContext,
  errorKind: ApiErrorKind,
): boolean {
  return captureDevelopmentAnalyticsEvent("api_error_shown", {
    ...createRecommendationScopedProperties(
      context.analyticsSessionId,
      context.recommendationSessionId,
    ),
    error_kind: errorKind,
  });
}

function recommendationItemProperties(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
) {
  return {
    ...createRecommendationScopedProperties(
      context.analyticsSessionId,
      context.recommendationSessionId,
    ),
    recommendation_item_id: item.recommendationItemId,
    media_type: item.mediaType,
    position: item.position,
  };
}

export function createRecommendationItemAnalyticsReference(
  mediaType: RecommendationMediaType,
  position: number,
): RecommendationItemAnalyticsReference | null {
  if (!Number.isInteger(position) || position < 1) {
    return null;
  }

  const recommendationItemId = generateAnalyticsId();

  if (recommendationItemId === null) {
    return null;
  }

  return {
    recommendationItemId,
    mediaType,
    position,
  };
}

export function trackRecommendationOpened(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
): boolean {
  return captureDevelopmentAnalyticsEvent(
    "recommendation_opened",
    recommendationItemProperties(context, item),
  );
}

export function trackTrailerClicked(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
): boolean {
  return captureDevelopmentAnalyticsEvent(
    "trailer_clicked",
    recommendationItemProperties(context, item),
  );
}

export function trackRecommendationSaved(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
  persistence: "persistent" | "session-only",
): boolean {
  return captureDevelopmentAnalyticsEvent("recommendation_saved", {
    ...recommendationItemProperties(context, item),
    persistence,
  });
}

export function trackRecommendationRejected(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
  rejectionReason: RecommendationRejectionReason,
): boolean {
  return captureDevelopmentAnalyticsEvent("recommendation_rejected", {
    ...recommendationItemProperties(context, item),
    rejection_reason: rejectionReason,
  });
}

export function trackRecommendationsRefreshed(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
): boolean {
  return captureDevelopmentAnalyticsEvent("recommendations_refreshed", {
    ...createRecommendationScopedProperties(
      context.analyticsSessionId,
      context.recommendationSessionId,
    ),
    recommendation_item_id: item.recommendationItemId,
    position: item.position,
    batch_sequence: context.batchSequence,
  });
}

export function trackWatchIntentConfirmed(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
): boolean {
  return captureDevelopmentAnalyticsEvent(
    "watch_intent_confirmed",
    recommendationItemProperties(context, item),
  );
}

export function trackFeedbackSubmitted(
  context: RecommendationAnalyticsContext,
  item: RecommendationItemAnalyticsReference,
  feedbackReason: FeedbackReasonCode,
  originatingAction: ReplacementFeedbackAction,
): boolean {
  return captureDevelopmentAnalyticsEvent("feedback_submitted", {
    ...createRecommendationScopedProperties(
      context.analyticsSessionId,
      context.recommendationSessionId,
    ),
    recommendation_item_id: item.recommendationItemId,
    feedback_reason: feedbackReason,
    originating_action: originatingAction,
  });
}

export function resetAnalyticsTrackerForTests(): void {
  capturedOnceKeys.clear();
}
