import { describe, expect, it } from "vitest";

import { RECOMMENDATION_HEURISTIC_VERSION } from "../shared/recommendation-version";
import {
  ANALYTICS_TAXONOMY_VERSION,
  ANALYTICS_UI_LOCALE,
  type PickTonightAnalyticsEventName,
  type PickTonightAnalyticsEventProperties,
} from "./analytics-events";
import {
  ANALYTICS_PROPERTY_ALLOWLIST_IS_EXHAUSTIVE,
  filterPickTonightAnalyticsBrowserProperties,
  PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST,
  POSTHOG_BROWSER_TRANSPORT_PROPERTY_ALLOWLIST,
} from "./analytics-property-policy";

const TOKEN = "phc_picktonight_test_project_token";
const DISTINCT_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RECOMMENDATION_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const RECOMMENDATION_ITEM_ID = "33333333-3333-4333-8333-333333333333";

const BASE_PROPERTIES = {
  taxonomy_version: ANALYTICS_TAXONOMY_VERSION,
  ui_locale: ANALYTICS_UI_LOCALE,
  analytics_environment: "development",
  traffic_class: "internal",
  session_id: SESSION_ID,
} as const;

const RECOMMENDATION_PROPERTIES = {
  ...BASE_PROPERTIES,
  recommendation_session_id: RECOMMENDATION_SESSION_ID,
  algorithm_version: RECOMMENDATION_HEURISTIC_VERSION,
} as const;

const ITEM_PROPERTIES = {
  ...RECOMMENDATION_PROPERTIES,
  recommendation_item_id: RECOMMENDATION_ITEM_ID,
  media_type: "movie",
  position: 1,
} as const;

const VALID_EVENT_PROPERTIES = {
  app_opened: {
    ...BASE_PROPERTIES,
  },

  consent_responded: {
    ...BASE_PROPERTIES,
    response: "accepted",
  },

  picker_started: {
    ...BASE_PROPERTIES,
  },

  picker_step_completed: {
    ...BASE_PROPERTIES,
    step: "preferences_reviewed",
  },

  picker_abandoned: {
    ...BASE_PROPERTIES,
    reason: "analytics_reset",
  },

  context_submitted: {
    ...RECOMMENDATION_PROPERTIES,
    media_type_code: "either",
    mood_code: "relaxed",
    companion_code: "friends",
    maximum_runtime_minutes: 120,
    freshness_year: 2020,
    content_language_code: "en",
    origin_country_code: "US",
    watch_region_code: "US",
    used_typed_input: true,
    required_restriction_count: 2,
    soft_preference_count: 3,
  },

  recommendation_batch_viewed: {
    ...RECOMMENDATION_PROPERTIES,
    batch_sequence: 1,
    recommendation_count: 3,
  },

  recommendation_empty_shown: {
    ...RECOMMENDATION_PROPERTIES,
  },

  recommendation_item_shown: {
    ...ITEM_PROPERTIES,
    batch_sequence: 1,
    impression_sequence: 1,
    candidate_age_code: "established",
    rating_confidence_code: "strong",
    provider_claim_status: "claimed",
    repeat_status: "first-shown",
  },

  recommendation_opened: {
    ...ITEM_PROPERTIES,
  },

  trailer_clicked: {
    ...ITEM_PROPERTIES,
  },

  recommendation_saved: {
    ...ITEM_PROPERTIES,
    persistence: "persistent",
  },

  recommendation_rejected: {
    ...ITEM_PROPERTIES,
    rejection_reason: "not-tonight",
  },

  recommendations_refreshed: {
    ...RECOMMENDATION_PROPERTIES,
    recommendation_item_id: RECOMMENDATION_ITEM_ID,
    position: 1,
    batch_sequence: 1,
  },

  watch_intent_confirmed: {
    ...ITEM_PROPERTIES,
  },

  feedback_submitted: {
    ...RECOMMENDATION_PROPERTIES,
    recommendation_item_id: RECOMMENDATION_ITEM_ID,
    feedback_reason: "other",
    originating_action: "replace",
  },

  api_error_shown: {
    ...RECOMMENDATION_PROPERTIES,
    error_kind: "network",
  },
} as const satisfies {
  readonly [
    TEventName in PickTonightAnalyticsEventName
  ]: PickTonightAnalyticsEventProperties[TEventName];
};

const HOSTILE_UNKNOWN_PROPERTIES = {
  rawText: "PRIVATE_RAW_PREFERENCE_SENTINEL",
  raw_text: "PRIVATE_RAW_PREFERENCE_SENTINEL",
  freeText: "PRIVATE_WRITTEN_FEEDBACK_SENTINEL",
  free_text: "PRIVATE_WRITTEN_FEEDBACK_SENTINEL",
  written_feedback: "PRIVATE_WRITTEN_FEEDBACK_SENTINEL",

  title: "PRIVATE_TITLE_SENTINEL",
  original_title: "PRIVATE_TITLE_SENTINEL",
  mediaKey: "tmdb:movie:12345",
  media_key: "tmdb:movie:12345",
  tmdb_id: 12345,
  posterUrl: "https://image.example/private.jpg",
  poster_url: "https://image.example/private.jpg",
  overview: "PRIVATE_OVERVIEW_SENTINEL",
  provider_url: "https://provider.example/watch/private",

  watchlist: [
    {
      title: "PRIVATE_WATCHLIST_TITLE",
      tmdb_id: 12345,
    },
  ],

  taste_profile: {
    favoriteGenre: "PRIVATE_PROFILE_VALUE",
  },

  profile_weights: {
    secret: 999,
  },

  email: "private@example.com",
  name: "Private Person",
  nested_payload: {
    secret: "PRIVATE_NESTED_SENTINEL",
  },

  $current_url: "https://picktonight.example/private?secret=yes",
  $host: "picktonight.example",
  $pathname: "/private",
  $referrer: "https://referrer.example/private",
  $referring_domain: "referrer.example",

  $browser: "Private Browser",
  $browser_version: "999",
  $os: "Private OS",
  $device_type: "Private Device",
  $user_agent: "PRIVATE_USER_AGENT_SENTINEL",

  $screen_width: 9999,
  $screen_height: 9999,
  $viewport_width: 8888,
  $viewport_height: 8888,

  $geoip_city_name: "PRIVATE_CITY",
  $geoip_country_name: "PRIVATE_COUNTRY",
  $geoip_postal_code: "PRIVATE_POSTAL",
  $geoip_latitude: 12.345678,
  $geoip_longitude: 98.765432,

  $session_entry_url: "https://picktonight.example/private-entry",
  $session_entry_pathname: "/private-entry",
  $session_entry_referrer: "https://private-referrer.example",
  $session_id: "provider-session-id",
  $window_id: "provider-window-id",

  $set: {
    email: "private@example.com",
  },

  $set_once: {
    initial_url: "https://picktonight.example/private",
  },

  sdk_debug_metadata: {
    private: true,
  },
} as const;

function transportProperties() {
  return {
    token: TOKEN,
    distinct_id: DISTINCT_ID,
    $process_person_profile: true,
  };
}

function filterFixture(eventName: PickTonightAnalyticsEventName) {
  return filterPickTonightAnalyticsBrowserProperties(eventName, {
    ...transportProperties(),
    ...VALID_EVENT_PROPERTIES[eventName],
  });
}

function expectEventToBeRejected(
  eventName: PickTonightAnalyticsEventName,
  overrides: Record<string, unknown>,
): void {
  expect(
    filterPickTonightAnalyticsBrowserProperties(eventName, {
      ...transportProperties(),
      ...VALID_EVENT_PROPERTIES[eventName],
      ...overrides,
    }),
  ).toBeNull();
}

describe("Issue #34 analytics browser property policy", () => {
  it("keeps the compile-time event-property registry exhaustive", () => {
    expect(ANALYTICS_PROPERTY_ALLOWLIST_IS_EXHAUSTIVE).toBe(true);

    expect(
      Object.keys(PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST).sort(),
    ).toEqual(Object.keys(VALID_EVENT_PROPERTIES).sort());
  });

  for (const eventName of Object.keys(
    VALID_EVENT_PROPERTIES,
  ) as PickTonightAnalyticsEventName[]) {
    it(`projects exactly the reviewed browser properties for ${eventName}`, () => {
      const filtered = filterPickTonightAnalyticsBrowserProperties(eventName, {
        ...transportProperties(),
        ...VALID_EVENT_PROPERTIES[eventName],
        ...HOSTILE_UNKNOWN_PROPERTIES,
      });

      expect(filtered).not.toBeNull();

      const expectedKeys = [
        ...POSTHOG_BROWSER_TRANSPORT_PROPERTY_ALLOWLIST,
        ...PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST[eventName],
      ].sort();

      expect(Object.keys(filtered ?? {}).sort()).toEqual(expectedKeys);

      expect(filtered).toMatchObject({
        token: TOKEN,
        distinct_id: DISTINCT_ID,
        $process_person_profile: false,
      });

      const serialized = JSON.stringify(filtered);

      for (const sensitiveValue of [
        "PRIVATE_RAW_PREFERENCE_SENTINEL",
        "PRIVATE_WRITTEN_FEEDBACK_SENTINEL",
        "PRIVATE_TITLE_SENTINEL",
        "PRIVATE_OVERVIEW_SENTINEL",
        "PRIVATE_WATCHLIST_TITLE",
        "PRIVATE_PROFILE_VALUE",
        "PRIVATE_NESTED_SENTINEL",
        "PRIVATE_USER_AGENT_SENTINEL",
        "PRIVATE_CITY",
        "PRIVATE_COUNTRY",
        "PRIVATE_POSTAL",
        "private@example.com",
        "tmdb:movie:12345",
      ]) {
        expect(serialized).not.toContain(sensitiveValue);
      }
    });
  }

  it("accepts every reviewed analytics environment code", () => {
    for (const analyticsEnvironment of [
      "development",
      "test",
      "preview",
      "pilot",
    ] as const) {
      const filtered = filterPickTonightAnalyticsBrowserProperties(
        "app_opened",
        {
          ...transportProperties(),
          ...VALID_EVENT_PROPERTIES.app_opened,
          analytics_environment: analyticsEnvironment,
          traffic_class: "internal",
        },
      );

      expect(filtered).not.toBeNull();
      expect(filtered?.analytics_environment).toBe(analyticsEnvironment);
      expect(filtered?.traffic_class).toBe("internal");
    }
  });

  it("rejects unreviewed environment and traffic-class codes", () => {
    expectEventToBeRejected("app_opened", {
      analytics_environment: "production",
    });

    expectEventToBeRejected("app_opened", {
      analytics_environment: "staging",
    });

    expectEventToBeRejected("app_opened", {
      traffic_class: "employee",
    });

    expectEventToBeRejected("app_opened", {
      traffic_class: "test-user",
    });
  });

  it("rejects invalid shared identifiers instead of forwarding them", () => {
    expectEventToBeRejected("app_opened", {
      session_id: "not-a-uuid",
    });

    expectEventToBeRejected("recommendation_opened", {
      recommendation_session_id: "not-a-uuid",
    });

    expectEventToBeRejected("recommendation_opened", {
      recommendation_item_id: "not-a-uuid",
    });

    expectEventToBeRejected("app_opened", {
      session_id: "11111111-1111-1111-8111-111111111111",
    });
  });

  it("rejects invalid structured context values", () => {
    expectEventToBeRejected("context_submitted", {
      mood_code: "whatever-I-feel-like",
    });

    expectEventToBeRejected("context_submitted", {
      content_language_code: "en-US",
    });

    expectEventToBeRejected("context_submitted", {
      origin_country_code: "usa",
    });

    expectEventToBeRejected("context_submitted", {
      watch_region_code: "us",
    });

    expectEventToBeRejected("context_submitted", {
      maximum_runtime_minutes: 0,
    });

    expectEventToBeRejected("context_submitted", {
      freshness_year: 1869,
    });

    expectEventToBeRejected("context_submitted", {
      freshness_year: 10_000,
    });

    expectEventToBeRejected("context_submitted", {
      required_restriction_count: 51,
    });

    expectEventToBeRejected("context_submitted", {
      soft_preference_count: -1,
    });
  });

  it("rejects invalid recommendation positions and batch bounds", () => {
    expectEventToBeRejected("recommendation_opened", {
      position: 0,
    });

    expectEventToBeRejected("recommendation_opened", {
      position: 4,
    });

    expectEventToBeRejected("recommendation_batch_viewed", {
      batch_sequence: 0,
    });

    expectEventToBeRejected("recommendation_batch_viewed", {
      recommendation_count: 4,
    });

    expectEventToBeRejected("recommendation_item_shown", {
      impression_sequence: 0,
    });

    expectEventToBeRejected("recommendations_refreshed", {
      batch_sequence: 0,
    });
  });

  it("rejects unreviewed item evidence and guardrail codes", () => {
    expectEventToBeRejected("recommendation_item_shown", {
      candidate_age_code: "new-release",
    });

    expectEventToBeRejected("recommendation_item_shown", {
      rating_confidence_code: "high",
    });

    expectEventToBeRejected("recommendation_item_shown", {
      provider_claim_status: "netflix",
    });

    expectEventToBeRejected("recommendation_item_shown", {
      repeat_status: "same-title",
    });
  });

  it("rejects free-form substitutes for reviewed decision enums", () => {
    expectEventToBeRejected("picker_abandoned", {
      reason: "browser-closed",
    });

    expectEventToBeRejected("recommendation_saved", {
      persistence: "cloud",
    });

    expectEventToBeRejected("recommendation_rejected", {
      rejection_reason: "I just hated the title",
    });

    expectEventToBeRejected("feedback_submitted", {
      feedback_reason: "This is my private written feedback",
    });

    expectEventToBeRejected("feedback_submitted", {
      originating_action: "details",
    });

    expectEventToBeRejected("api_error_shown", {
      error_kind: "provider-stack-trace",
    });
  });

  it("requires only reviewed transport identity and forces person profiles off", () => {
    expect(
      filterPickTonightAnalyticsBrowserProperties("app_opened", {
        ...VALID_EVENT_PROPERTIES.app_opened,
        distinct_id: DISTINCT_ID,
      }),
    ).toBeNull();

    expect(
      filterPickTonightAnalyticsBrowserProperties("app_opened", {
        ...VALID_EVENT_PROPERTIES.app_opened,
        token: TOKEN,
      }),
    ).toBeNull();

    expect(
      filterPickTonightAnalyticsBrowserProperties("app_opened", {
        ...transportProperties(),
        ...VALID_EVENT_PROPERTIES.app_opened,
        distinct_id: "private@example.com",
      }),
    ).toBeNull();

    expect(filterFixture("app_opened")).toEqual({
      token: TOKEN,
      distinct_id: DISTINCT_ID,
      $process_person_profile: false,
      ...VALID_EVENT_PROPERTIES.app_opened,
    });
  });

  it("does not permit PostHog automatic events through the property policy", () => {
    expect(
      filterPickTonightAnalyticsBrowserProperties("$pageview", {
        ...transportProperties(),
        ...BASE_PROPERTIES,
        $current_url: "https://picktonight.example/private",
      }),
    ).toBeNull();
  });
});
