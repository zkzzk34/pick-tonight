import type { SupportedMood } from "../shared/recommendation-contracts";
import { RECOMMENDATION_HEURISTIC_VERSION } from "../shared/recommendation-version";
import type {
  FeedbackReasonCode,
  ReplacementFeedbackAction,
} from "./feedback-session";

export const ANALYTICS_TAXONOMY_VERSION = 2 as const;
export const ANALYTICS_UI_LOCALE = "en-US" as const;

export const PICKTONIGHT_ANALYTICS_EVENT_NAMES = [
  "app_opened",
  "consent_responded",
  "picker_started",
  "picker_step_completed",
  "picker_abandoned",
  "context_submitted",
  "recommendation_batch_viewed",
  "recommendation_empty_shown",
  "recommendation_opened",
  "trailer_clicked",
  "recommendation_saved",
  "recommendation_rejected",
  "recommendations_refreshed",
  "watch_intent_confirmed",
  "feedback_submitted",
  "api_error_shown",
] as const;

export type PickTonightAnalyticsEventName =
  (typeof PICKTONIGHT_ANALYTICS_EVENT_NAMES)[number];

const PICKTONIGHT_ANALYTICS_EVENT_NAME_SET = new Set<string>(
  PICKTONIGHT_ANALYTICS_EVENT_NAMES,
);

export function isPickTonightAnalyticsEventName(
  value: string,
): value is PickTonightAnalyticsEventName {
  return PICKTONIGHT_ANALYTICS_EVENT_NAME_SET.has(value);
}

export type AnalyticsEnvironmentCode = "development" | "pilot";

export type AnalyticsTrafficClass = "internal" | "participant";

export interface AnalyticsBaseProperties {
  readonly taxonomy_version: typeof ANALYTICS_TAXONOMY_VERSION;
  readonly ui_locale: typeof ANALYTICS_UI_LOCALE;
  readonly analytics_environment: AnalyticsEnvironmentCode;
  readonly traffic_class: AnalyticsTrafficClass;
  readonly session_id: string;
}

export interface RecommendationScopedProperties extends AnalyticsBaseProperties {
  readonly recommendation_session_id: string;
  readonly algorithm_version: typeof RECOMMENDATION_HEURISTIC_VERSION;
}

export type RecommendationMediaType = "movie" | "tv";

export interface RecommendationItemProperties extends RecommendationScopedProperties {
  readonly recommendation_item_id: string;
  readonly media_type: RecommendationMediaType;
  readonly position: number;
}

export type PickerAbandonmentReason =
  "opened_saved" | "analytics_reset" | "all_data_reset";

export type RecommendationRejectionReason =
  "not-tonight" | "not-my-taste" | "already-watched";

export type ApiErrorKind =
  "network" | "upstream" | "invalid-response" | "unknown";

export interface ContextSummaryProperties {
  readonly media_type_code?: "movie" | "tv" | "either";
  readonly mood_code?: SupportedMood;
  readonly companion_code?: "alone" | "partner" | "friends" | "family";
  readonly maximum_runtime_minutes?: number;
  readonly freshness_year?: number;
  readonly content_language_code?: string;
  readonly origin_country_code?: string;
  readonly watch_region_code?: string;

  readonly used_typed_input: boolean;
  readonly required_restriction_count: number;
  readonly soft_preference_count: number;
}

export interface PickTonightAnalyticsEventProperties {
  readonly app_opened: AnalyticsBaseProperties;

  readonly consent_responded: AnalyticsBaseProperties & {
    readonly response: "accepted";
  };

  readonly picker_started: AnalyticsBaseProperties;

  readonly picker_step_completed: AnalyticsBaseProperties & {
    readonly step: "preferences_reviewed";
  };

  readonly picker_abandoned: AnalyticsBaseProperties & {
    readonly reason: PickerAbandonmentReason;
  };

  readonly context_submitted: RecommendationScopedProperties &
    ContextSummaryProperties;

  readonly recommendation_batch_viewed: RecommendationScopedProperties & {
    readonly batch_sequence: number;
    readonly recommendation_count: number;
  };
  readonly recommendation_empty_shown: RecommendationScopedProperties;

  readonly recommendation_opened: RecommendationItemProperties;

  readonly trailer_clicked: RecommendationItemProperties;

  readonly recommendation_saved: RecommendationItemProperties & {
    readonly persistence: "persistent" | "session-only";
  };

  readonly recommendation_rejected: RecommendationItemProperties & {
    readonly rejection_reason: RecommendationRejectionReason;
  };

  readonly recommendations_refreshed: RecommendationScopedProperties & {
    readonly recommendation_item_id: string;
    readonly position: number;
    readonly batch_sequence: number;
  };

  readonly watch_intent_confirmed: RecommendationItemProperties;

  readonly feedback_submitted: RecommendationScopedProperties & {
    readonly recommendation_item_id: string;
    readonly feedback_reason: FeedbackReasonCode;
    readonly originating_action: ReplacementFeedbackAction;
  };

  readonly api_error_shown: RecommendationScopedProperties & {
    readonly error_kind: ApiErrorKind;
  };
}

export type AnalyticsEventProperties<
  TEventName extends PickTonightAnalyticsEventName,
> = PickTonightAnalyticsEventProperties[TEventName];

export function createAnalyticsBaseProperties(
  sessionId: string,
): AnalyticsBaseProperties {
  const isDevelopment = import.meta.env.DEV;

  return {
    taxonomy_version: ANALYTICS_TAXONOMY_VERSION,
    ui_locale: ANALYTICS_UI_LOCALE,
    analytics_environment: isDevelopment ? "development" : "pilot",
    traffic_class: isDevelopment ? "internal" : "participant",
    session_id: sessionId,
  };
}

export function createRecommendationScopedProperties(
  sessionId: string,
  recommendationSessionId: string,
): RecommendationScopedProperties {
  return {
    ...createAnalyticsBaseProperties(sessionId),
    recommendation_session_id: recommendationSessionId,
    algorithm_version: RECOMMENDATION_HEURISTIC_VERSION,
  };
}
