# PickTonight analytics event taxonomy

Issue #33 defines PickTonight's explicit, consent-gated product analytics
vocabulary and property contract.

It does not enable PostHog autocapture or other automatic product collection.

## Global contract

- Event names use lowercase `object_action` snake case.
- Product analytics are optional and consent-gated.
- Nothing is queued before analytics consent.
- Nothing that happened before consent is replayed after later acceptance.
- Declining analytics produces no provider event.
- Events fire from explicit application transitions and user-action handlers,
  never merely because React rendered.
- `taxonomy_version` is exactly `1`.
- `ui_locale` is exactly `en-US` for the MVP.
- `session_id` is PickTonight's page-session analytics UUID.
- The persistent anonymous browser identifier remains PostHog's distinct ID and
  is not duplicated as a custom event property.
- Recommendation journeys use a separate `recommendation_session_id`.
- Recommendation-scoped events include the shared `algorithm_version`.
- Recommendation-item events use an opaque, in-memory
  `recommendation_item_id`.
- Exact titles, TMDB IDs, poster URLs, overview text, provider URLs, and raw
  watchlist contents are excluded.
- Free-form preference text and written feedback are excluded from analytics.
- Content-language and origin-country selections use codes rather than
  translated labels.
- Issue #34 owns the final sensitive-data/property allowlist audit.

## Shared property contracts

Every product event requires:

| Property | Contract |
| --- | --- |
| `taxonomy_version` | exactly `1` |
| `ui_locale` | exactly `en-US` |
| `session_id` | PickTonight analytics page-session identifier |

Recommendation-scoped events additionally require:

| Property | Contract |
| --- | --- |
| `recommendation_session_id` | opaque identifier for one submitted recommendation journey |
| `algorithm_version` | shared recommendation heuristic version; currently `recommendation-v3` |

Recommendation-item events additionally require:

| Property | Contract |
| --- | --- |
| `recommendation_item_id` | opaque UUID generated only for analytics |
| `media_type` | `movie` or `tv` |
| `position` | one-based integer position in the displayed recommendation set |

## Event contract

### `app_opened`

**Owner:** app analytics lifecycle.

**Fires:** once when analytics becomes active in the current page session. If
accepted consent already exists, it fires after provider activation on load. If
consent is accepted during the visit, it fires only after acceptance and
activation. Pre-consent activity is not replayed.

**Required properties:** shared properties only.

**Optional properties:** none.

**Allowed values:** `taxonomy_version=1`, `ui_locale=en-US`, and the current
PickTonight `session_id`. No event-specific values are allowed.

### `consent_responded`

**Owner:** app consent handler.

**Fires:** after the user accepts analytics and provider-backed analytics become
eligible. Declining analytics produces no provider event.

**Required properties:** shared properties plus `response`.

**Optional properties:** none.

**Allowed values:** `response` is exactly `accepted`. Shared properties follow
the global contract.

### `picker_started`

**Owner:** preference-entry flow.

**Fires:** once on the first deliberate interaction with the picker for the
current picker attempt.

**Required properties:** shared properties only.

**Optional properties:** none.

**Allowed values:** only the shared-property values defined by the global
contract.

### `picker_step_completed`

**Owner:** preference-entry flow.

**Fires:** when the user deliberately advances from preference entry to the
review step.

**Required properties:** shared properties plus `step`.

**Optional properties:** none.

**Allowed values:** `step` is exactly `preferences_reviewed`. Shared properties
follow the global contract.

### `picker_abandoned`

**Owner:** app and picker navigation lifecycle.

**Fires:** only for an explicit in-app abandonment after the picker has started
and before context submission. Browser unload, `pagehide`, React cleanup, and
inferred tab close do not fire this event.

**Required properties:** shared properties plus `reason`.

**Optional properties:** none.

**Allowed values:** `reason` is one of:

- `opened_saved`
- `analytics_reset`
- `all_data_reset`

### `context_submitted`

**Owner:** recommendation request submission.

**Fires:** once for a deliberate valid context submission that starts a new
recommendation journey.

**Required properties:**

- recommendation-scoped properties
- `used_typed_input`
- `required_restriction_count`
- `soft_preference_count`

**Optional properties:**

- `media_type_code`
- `mood_code`
- `companion_code`
- `maximum_runtime_minutes`
- `freshness_year`
- `content_language_code`
- `origin_country_code`
- `watch_region_code`

**Allowed values:**

- `used_typed_input`: `true` or `false`
- `required_restriction_count`: non-negative integer
- `soft_preference_count`: non-negative integer
- `media_type_code`: `movie`, `tv`, or `either`
- `mood_code`: one of the stable codes in the shared `SupportedMood` contract
- `companion_code`: `alone`, `partner`, `friends`, or `family`
- `maximum_runtime_minutes`: numeric runtime constraint accepted by the
  recommendation request contract
- `freshness_year`: numeric year accepted by the recommendation request
  contract
- `content_language_code`: stable content-language code; translated labels are
  not allowed
- `origin_country_code`: stable origin-country code; translated labels are not
  allowed
- `watch_region_code`: stable watch-region code
- `algorithm_version`: current shared recommendation version
- `recommendation_session_id`: opaque recommendation-journey identifier

`rawText` and other free-form preference text are never included.

### `recommendation_batch_viewed`

**Owner:** recommendation request result lifecycle.

**Fires:** once when a successful recommendation batch becomes available to the
user.

**Required properties:**

- recommendation-scoped properties
- `batch_sequence`
- `recommendation_count`

**Optional properties:** none.

**Allowed values:** `batch_sequence` is a positive integer identifying the
displayed batch within the journey. `recommendation_count` is a non-negative
integer. Recommendation-scoped values follow the global contract.

### `recommendation_opened`

**Owner:** recommendation detail action handler.

**Fires:** on each deliberate Details open. Repeated deliberate opens remain
separate events.

**Required properties:** recommendation-item properties.

**Optional properties:** none.

**Allowed values:** `media_type` is `movie` or `tv`; `position` is a one-based
integer; `recommendation_item_id` is an opaque analytics identifier. Shared
recommendation-scoped values follow the global contract.

### `trailer_clicked`

**Owner:** recommendation-card and title-detail trailer action handlers.

**Fires:** on each deliberate trailer-link action from either supported
surface.

**Required properties:** recommendation-item properties.

**Optional properties:** none.

**Allowed values:** `media_type` is `movie` or `tv`; `position` is a one-based
integer; `recommendation_item_id` is an opaque analytics identifier. No title
or trailer URL is sent.

### `recommendation_saved`

**Owner:** recommendation action handler.

**Fires:** only when Save actually adds the item. An `already-saved` no-op does
not fire the event.

**Required properties:** recommendation-item properties plus `persistence`.

**Optional properties:** none.

**Allowed values:** `persistence` is one of:

- `persistent`
- `session-only`

Recommendation-item properties follow the shared contract.

### `recommendation_rejected`

**Owner:** recommendation action handler.

**Fires:** when the user deliberately rejects a recommendation. The event fires
for the rejection action even if no replacement remains available.

**Required properties:** recommendation-item properties plus
`rejection_reason`.

**Optional properties:** none.

**Allowed values:** `rejection_reason` is one of:

- `not-tonight`
- `not-my-taste`
- `already-watched`

### `recommendations_refreshed`

**Owner:** explicit neutral replacement handler.

**Fires:** only after an explicit neutral Replace action successfully installs a
replacement. Rejection-driven replacement does not produce this event.

**Required properties:**

- recommendation-scoped properties
- `recommendation_item_id`
- `position`
- `batch_sequence`

**Optional properties:** none.

**Allowed values:** `recommendation_item_id` is an opaque analytics identifier;
`position` is a one-based integer; `batch_sequence` is a positive integer for
the active recommendation batch. Recommendation-scoped values follow the global
contract.

### `watch_intent_confirmed`

**Owner:** recommendation action handler.

**Fires:** when the user deliberately selects Choose Tonight.

**Required properties:** recommendation-item properties.

**Optional properties:** none.

**Allowed values:** `media_type` is `movie` or `tv`; `position` is a one-based
integer; `recommendation_item_id` is opaque. This event records intent only and
does not mean the title was watched.

### `feedback_submitted`

**Owner:** structured feedback handler.

**Fires:** after the user selects and submits a structured feedback reason.
Skipping the feedback prompt does not fire the event.

**Required properties:**

- recommendation-scoped properties
- `recommendation_item_id`
- `feedback_reason`
- `originating_action`

**Optional properties:** none.

**Allowed values:** `feedback_reason` is one of:

- `too-long`
- `unavailable`
- `wrong-mood`
- `disliked-genre`
- `rating-content-concern`
- `not-interested`
- `other`

`originating_action` is one of:

- `replace`
- `not-tonight`
- `not-my-taste`
- `already-watched`

Written/free-form feedback is never an analytics property.

### `api_error_shown`

**Owner:** recommendation request result lifecycle.

**Fires:** once when a recommendation-request failure becomes user-visible,
rather than once per render.

**Required properties:** recommendation-scoped properties plus `error_kind`.

**Optional properties:** none.

**Allowed values:** `error_kind` is one of:

- `network`
- `upstream`
- `invalid-response`
- `unknown`

Arbitrary provider error messages or stack text are not included.

## Duplicate-event rule

Repeated deliberate user actions remain meaningful separate events. For
example, opening the same recommendation twice may produce two
`recommendation_opened` events.

Duplicate suppression applies only to non-user duplication such as rerenders,
React development behavior, repeated effects, or repeated processing of the
same successful batch.

One-time lifecycle events therefore use explicit lifecycle, attempt, session, or
batch keys rather than render occurrence as their firing condition.

## Privacy boundary

The taxonomy intentionally excludes:

- free-form preference text
- written feedback text
- exact title names
- TMDB IDs
- poster URLs
- overview text
- provider URLs
- raw watchlist contents

Recommendation-item analytics identity is opaque and in-memory only. It is not
written into watchlist storage, analytics identity storage, or feedback-session
storage.
