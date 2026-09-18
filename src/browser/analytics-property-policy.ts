import type { SupportedMood } from "../shared/recommendation-contracts";
import { RECOMMENDATION_HEURISTIC_VERSION } from "../shared/recommendation-version";
import {
  ANALYTICS_TAXONOMY_VERSION,
  ANALYTICS_UI_LOCALE,
  isPickTonightAnalyticsEventName,
  type PickTonightAnalyticsEventName,
  type PickTonightAnalyticsEventProperties,
} from "./analytics-events";

type PropertyRecord = Record<string, unknown>;

type AnalyticsPropertyAllowlist = {
  readonly [
    TEventName in PickTonightAnalyticsEventName
  ]: readonly (keyof PickTonightAnalyticsEventProperties[TEventName])[];
};

export const PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST = {
  app_opened: ["taxonomy_version", "ui_locale", "session_id"],
  consent_responded: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "response",
  ],
  picker_started: ["taxonomy_version", "ui_locale", "session_id"],
  picker_step_completed: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "step",
  ],
  picker_abandoned: ["taxonomy_version", "ui_locale", "session_id", "reason"],
  context_submitted: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "media_type_code",
    "mood_code",
    "companion_code",
    "maximum_runtime_minutes",
    "freshness_year",
    "content_language_code",
    "origin_country_code",
    "watch_region_code",
    "used_typed_input",
    "required_restriction_count",
    "soft_preference_count",
  ],
  recommendation_batch_viewed: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "batch_sequence",
    "recommendation_count",
  ],
  recommendation_opened: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "media_type",
    "position",
  ],
  trailer_clicked: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "media_type",
    "position",
  ],
  recommendation_saved: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "media_type",
    "position",
    "persistence",
  ],
  recommendation_rejected: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "media_type",
    "position",
    "rejection_reason",
  ],
  recommendations_refreshed: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "position",
    "batch_sequence",
  ],
  watch_intent_confirmed: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "media_type",
    "position",
  ],
  feedback_submitted: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "recommendation_item_id",
    "feedback_reason",
    "originating_action",
  ],
  api_error_shown: [
    "taxonomy_version",
    "ui_locale",
    "session_id",
    "recommendation_session_id",
    "algorithm_version",
    "error_kind",
  ],
} as const satisfies AnalyticsPropertyAllowlist;

type MissingAllowlistedPropertyKeys = {
  [TEventName in PickTonightAnalyticsEventName]: Exclude<
    keyof PickTonightAnalyticsEventProperties[TEventName],
    (typeof PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST)[TEventName][number]
  >;
}[PickTonightAnalyticsEventName];

/**
 * This assignment intentionally fails TypeScript compilation when a property
 * is added to an analytics event contract without being reviewed and added to
 * the explicit property allowlist above.
 */
export const ANALYTICS_PROPERTY_ALLOWLIST_IS_EXHAUSTIVE: MissingAllowlistedPropertyKeys extends never
  ? true
  : false = true;

/**
 * Minimum properties allowed to survive the browser SDK boundary.
 *
 * `token` is required by PostHog ingestion.
 * `distinct_id` is PickTonight's random consent-gated browser UUID.
 * `$process_person_profile` remains false as defense in depth.
 *
 * Browser/device/URL/referrer/GeoIP/session-entry/provider metadata is not
 * included here and therefore cannot survive the browser projection.
 */
export const POSTHOG_BROWSER_TRANSPORT_PROPERTY_ALLOWLIST = [
  "token",
  "distinct_id",
  "$process_person_profile",
] as const;

const SUPPORTED_ANALYTICS_MOODS = [
  "relaxed",
  "laughing",
  "excited",
  "thoughtful",
  "romantic",
  "spooked",
  "surprised",
] as const satisfies readonly SupportedMood[];

type MissingSupportedMood = Exclude<
  SupportedMood,
  (typeof SUPPORTED_ANALYTICS_MOODS)[number]
>;

const ANALYTICS_MOOD_ALLOWLIST_IS_EXHAUSTIVE: MissingSupportedMood extends never
  ? true
  : false = true;

void ANALYTICS_MOOD_ALLOWLIST_IS_EXHAUSTIVE;

const FEEDBACK_REASON_CODES = [
  "too-long",
  "unavailable",
  "wrong-mood",
  "disliked-genre",
  "rating-content-concern",
  "not-interested",
  "other",
] as const;

const FEEDBACK_ORIGINATING_ACTIONS = [
  "replace",
  "not-tonight",
  "not-my-taste",
  "already-watched",
] as const;

const REJECTION_REASONS = [
  "not-tonight",
  "not-my-taste",
  "already-watched",
] as const;

const ABANDONMENT_REASONS = [
  "opened_saved",
  "analytics_reset",
  "all_data_reset",
] as const;

const API_ERROR_KINDS = [
  "network",
  "upstream",
  "invalid-response",
  "unknown",
] as const;

const RECOMMENDATION_MEDIA_TYPES = ["movie", "tv"] as const;
const CONTEXT_MEDIA_TYPES = ["movie", "tv", "either"] as const;
const COMPANION_CODES = ["alone", "partner", "friends", "family"] as const;
const PERSISTENCE_CODES = ["persistent", "session-only"] as const;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LANGUAGE_CODE_PATTERN = /^[a-z]{2}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const MINIMUM_FRESHNESS_YEAR = 1870;
const MAXIMUM_FRESHNESS_YEAR = 9999;
const MAXIMUM_RECOMMENDATION_COUNT = 3;
const MAXIMUM_CONTEXT_COUNT = 50;

function isPropertyRecord(value: unknown): value is PropertyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnProperty(value: PropertyRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CODE_PATTERN.test(value);
}

function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && COUNTRY_CODE_PATTERN.test(value);
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is TValue {
  return (
    typeof value === "string" &&
    (allowedValues as readonly string[]).includes(value)
  );
}

function isOptionalPropertyValid(
  properties: PropertyRecord,
  key: string,
  validate: (value: unknown) => boolean,
): boolean {
  return !hasOwnProperty(properties, key) || validate(properties[key]);
}

function hasValidBaseProperties(properties: PropertyRecord): boolean {
  return (
    properties.taxonomy_version === ANALYTICS_TAXONOMY_VERSION &&
    properties.ui_locale === ANALYTICS_UI_LOCALE &&
    isUuidV4(properties.session_id)
  );
}

function hasValidRecommendationScopedProperties(
  properties: PropertyRecord,
): boolean {
  return (
    hasValidBaseProperties(properties) &&
    isUuidV4(properties.recommendation_session_id) &&
    properties.algorithm_version === RECOMMENDATION_HEURISTIC_VERSION
  );
}

function hasValidRecommendationItemProperties(
  properties: PropertyRecord,
): boolean {
  return (
    hasValidRecommendationScopedProperties(properties) &&
    isUuidV4(properties.recommendation_item_id) &&
    isOneOf(properties.media_type, RECOMMENDATION_MEDIA_TYPES) &&
    isBoundedInteger(properties.position, 1, MAXIMUM_RECOMMENDATION_COUNT)
  );
}

function validateProjectedProperties(
  eventName: PickTonightAnalyticsEventName,
  properties: PropertyRecord,
): boolean {
  switch (eventName) {
    case "app_opened":
    case "picker_started":
      return hasValidBaseProperties(properties);

    case "consent_responded":
      return (
        hasValidBaseProperties(properties) && properties.response === "accepted"
      );

    case "picker_step_completed":
      return (
        hasValidBaseProperties(properties) &&
        properties.step === "preferences_reviewed"
      );

    case "picker_abandoned":
      return (
        hasValidBaseProperties(properties) &&
        isOneOf(properties.reason, ABANDONMENT_REASONS)
      );

    case "context_submitted":
      return (
        hasValidRecommendationScopedProperties(properties) &&
        typeof properties.used_typed_input === "boolean" &&
        isBoundedInteger(
          properties.required_restriction_count,
          0,
          MAXIMUM_CONTEXT_COUNT,
        ) &&
        isBoundedInteger(
          properties.soft_preference_count,
          0,
          MAXIMUM_CONTEXT_COUNT,
        ) &&
        isOptionalPropertyValid(properties, "media_type_code", (value) =>
          isOneOf(value, CONTEXT_MEDIA_TYPES),
        ) &&
        isOptionalPropertyValid(properties, "mood_code", (value) =>
          isOneOf(value, SUPPORTED_ANALYTICS_MOODS),
        ) &&
        isOptionalPropertyValid(properties, "companion_code", (value) =>
          isOneOf(value, COMPANION_CODES),
        ) &&
        isOptionalPropertyValid(
          properties,
          "maximum_runtime_minutes",
          isSafePositiveInteger,
        ) &&
        isOptionalPropertyValid(properties, "freshness_year", (value) =>
          isBoundedInteger(
            value,
            MINIMUM_FRESHNESS_YEAR,
            MAXIMUM_FRESHNESS_YEAR,
          ),
        ) &&
        isOptionalPropertyValid(
          properties,
          "content_language_code",
          isLanguageCode,
        ) &&
        isOptionalPropertyValid(
          properties,
          "origin_country_code",
          isCountryCode,
        ) &&
        isOptionalPropertyValid(properties, "watch_region_code", isCountryCode)
      );

    case "recommendation_batch_viewed":
      return (
        hasValidRecommendationScopedProperties(properties) &&
        isSafePositiveInteger(properties.batch_sequence) &&
        isBoundedInteger(
          properties.recommendation_count,
          0,
          MAXIMUM_RECOMMENDATION_COUNT,
        )
      );

    case "recommendation_opened":
    case "trailer_clicked":
    case "watch_intent_confirmed":
      return hasValidRecommendationItemProperties(properties);

    case "recommendation_saved":
      return (
        hasValidRecommendationItemProperties(properties) &&
        isOneOf(properties.persistence, PERSISTENCE_CODES)
      );

    case "recommendation_rejected":
      return (
        hasValidRecommendationItemProperties(properties) &&
        isOneOf(properties.rejection_reason, REJECTION_REASONS)
      );

    case "recommendations_refreshed":
      return (
        hasValidRecommendationScopedProperties(properties) &&
        isUuidV4(properties.recommendation_item_id) &&
        isBoundedInteger(
          properties.position,
          1,
          MAXIMUM_RECOMMENDATION_COUNT,
        ) &&
        isSafePositiveInteger(properties.batch_sequence)
      );

    case "feedback_submitted":
      return (
        hasValidRecommendationScopedProperties(properties) &&
        isUuidV4(properties.recommendation_item_id) &&
        isOneOf(properties.feedback_reason, FEEDBACK_REASON_CODES) &&
        isOneOf(properties.originating_action, FEEDBACK_ORIGINATING_ACTIONS)
      );

    case "api_error_shown":
      return (
        hasValidRecommendationScopedProperties(properties) &&
        isOneOf(properties.error_kind, API_ERROR_KINDS)
      );
  }
}

function projectEventProperties(
  eventName: PickTonightAnalyticsEventName,
  source: PropertyRecord,
): PropertyRecord {
  const projected: PropertyRecord = {};

  for (const key of PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST[eventName]) {
    if (hasOwnProperty(source, key)) {
      projected[key] = source[key];
    }
  }

  return projected;
}

function isBoundedNonEmptyString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

/**
 * Reconstruct the exact property object that may leave the browser.
 *
 * Unknown PickTonight fields and SDK/provider metadata are never copied.
 * Invalid approved fields reject the whole event rather than forwarding an
 * unexpected value.
 */
export function filterPickTonightAnalyticsBrowserProperties(
  eventName: string,
  properties: unknown,
): PropertyRecord | null {
  if (
    !isPickTonightAnalyticsEventName(eventName) ||
    !isPropertyRecord(properties)
  ) {
    return null;
  }

  const projectedEventProperties = projectEventProperties(
    eventName,
    properties,
  );

  if (!validateProjectedProperties(eventName, projectedEventProperties)) {
    return null;
  }

  const token = properties.token;
  const distinctId = properties.distinct_id;

  if (!isBoundedNonEmptyString(token, 256) || !isUuidV4(distinctId)) {
    return null;
  }

  return {
    token,
    distinct_id: distinctId,
    $process_person_profile: false,
    ...projectedEventProperties,
  };
}
