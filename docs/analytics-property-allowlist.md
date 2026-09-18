# PickTonight analytics property allowlist

Issue #34 defines the final property boundary for PickTonight's optional product
analytics.

The policy uses two independent enforcement points:

1. a browser boundary before an event leaves PickTonight; and
2. a PostHog ingestion boundary before the event is stored.

Neither boundary relies on a blacklist of known-sensitive property names.

## Browser boundary

The browser policy is implemented in:

- `src/browser/analytics-property-policy.ts`
- `src/browser/analytics-posthog.ts`

`PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST` is the reviewed source of truth for
the custom properties allowed on each of the 15 product events.

The registry is compile-time exhaustive against
`PickTonightAnalyticsEventProperties`. Adding a property to the typed event
contract without adding it to the reviewed property registry fails TypeScript
compilation.

At runtime, the browser:

1. rejects event names outside the reviewed 16-event taxonomy;
2. projects the event onto that event's reviewed property keys;
3. validates coded, bounded, boolean, numeric, and UUID values;
4. drops the event if required reviewed values are invalid;
5. preserves only the PostHog transport properties required for delivery:
   `token`, the opaque UUID `distinct_id`, and
   `$process_person_profile=false`.

Provider-added browser, device, URL, referrer, screen, viewport, session-entry,
GeoIP, person-update, and other unreviewed properties are not copied into the
outgoing property object.

The automated hostile-property tests inject examples of those property classes
together with titles, TMDB identifiers, free-form text, written feedback,
watchlist-shaped data, profile-shaped data, URLs, and nested objects.

## Issue #35 taxonomy v2 extension

Issue #35 expands the reviewed vocabulary from 15 to 16 events and increments
`taxonomy_version` to `2`.

Every reviewed event now includes the coded properties:

- `analytics_environment = development | pilot`
- `traffic_class = internal | participant`

The new `recommendation_empty_shown` event carries only recommendation-scoped
properties.

Both new base properties and the new event remain subject to the same dual
browser/storage allowlist. They do not reopen browser, URL, GeoIP, title,
TMDB-ID, or free-text collection.

## PostHog storage boundary

The repository-owned transformation source is:

`docs/posthog/picktonight-property-allowlist.hog`

It reconstructs `event.properties` independently for each reviewed PickTonight
event.

Only the event-specific PickTonight property keys are copied.

Transport properties used to deliver the event are not deliberately retained as
custom stored properties by the transformation. PostHog's event-envelope fields
such as the event name, event UUID, distinct ID, and timestamp remain separate
from the reconstructed custom property object.

The transformation is a second boundary. It does not replace the browser
boundary.

## Required PostHog Development configuration

The PickTonight Development project must use all of the following:

- **Discard client IP data:** enabled.
- **GeoIP enrichment transformation:** disabled.
- **PickTonight property allowlist transformation:** enabled.
- **Transformation event filter:** exactly the 16 reviewed PickTonight product
  event names.
- **Transformation order:** the PickTonight property allowlist must be the last
  transformation capable of modifying those events.

The browser sends events directly to PostHog, so PostHog's network edge still
receives the source connection. Project-level raw-IP discard controls retention;
it does not make the direct browser connection disappear.

A first-party analytics relay would be required if the product policy later
changes to require that PostHog never receive the end-user network address at
transport time.

## GeoIP

Raw-IP discard and GeoIP enrichment are separate controls.

The development project must not enrich PickTonight events with location data.
The GeoIP transformation therefore remains disabled even when raw-IP discard is
enabled.

The storage allowlist transformation additionally strips provider-added
property metadata that exists before it runs.

## Issue #32 verification event

The infrastructure-only event:

`picktonight_development_analytics_verified`

was retired by Issue #34.

Issue #32's historical verification remains documented as historical evidence,
but the event is no longer emitted by the application and is not part of the
15-event product taxonomy.

## Recommendation item identity

`recommendation_item_id` remains an opaque UUIDv4 generated in memory.

It exists so deliberate actions on one displayed recommendation can be
correlated without sending the title, TMDB ID, media key, provider URL, or
watchlist identifier.

It is not persisted into the watchlist or other product storage.

## Reset boundary

Issue #34 preserves the Issue #33 reset behavior:

1. if an active picker is being abandoned, emit the coded
   `picker_abandoned` event;
2. deactivate analytics immediately afterward;
3. clear consent and analytics identifiers.

The supported reset reasons remain:

- `analytics_reset`
- `all_data_reset`

This is an explicit in-app lifecycle event. Browser unload, tab close,
`pagehide`, and React cleanup are not used to infer abandonment.

## Historical event schemas

Events captured before the Issue #34 deployment may still expose old PostHog
provider-property names in schema discovery.

That historical schema is not evidence that post-change events still contain
those fields.

Live verification must therefore use a time window beginning after:

1. the browser code containing the Issue #34 boundary is running;
2. GeoIP enrichment is disabled; and
3. the storage-side allowlist transformation is enabled.

## Live verification checklist

After deployment:

1. accept analytics in a clean browser session;
2. exercise several picker and recommendation actions;
3. inspect events captured only after the deployment timestamp;
4. confirm expected PickTonight properties remain;
5. confirm title, TMDB, media-key, URL, free-text, watchlist, browser, device,
   user-agent, screen, viewport, session-entry, referrer, and GeoIP properties
   are absent from the stored PickTonight event properties;
6. confirm raw client IP retention remains disabled;
7. deliberately inject an unapproved test property through a development-only
   verification path and confirm it is absent after ingestion;
8. record the verification timestamp and observed event names in the Issue #34
   completion evidence.

## Policy changes

A new analytics property is not approved merely because it is technically easy
to capture.

A property change requires:

1. updating the typed event contract;
2. updating the browser allowlist;
3. updating value validation;
4. updating tests;
5. updating the PostHog transformation source;
6. reviewing the privacy impact; and
7. repeating time-bounded live verification.

## Live verification — 2026-09-18

Issue #34 was verified against the **PickTonight Development** PostHog project
after both enforcement boundaries were in place.

Verified project configuration:

- project-level **Discard client IP data** was enabled;
- the built-in **GeoIP** transformation was paused;
- **PickTonight — Property Allowlist v1** was active;
- the PickTonight allowlist transformation had priority 2, after the paused
  GeoIP transformation at priority 1;
- the transformation filter targeted the reviewed 15-event PickTonight
  taxonomy.

The custom transformation's built-in test runner was exercised with hostile
synthetic `context_submitted` and `recommendation_opened` envelopes containing
URL, browser, OS, device, user-agent, screen, viewport, GeoIP, session-entry,
title, TMDB ID, media-key, free-text, and unknown properties.

The transformation succeeded and removed those unapproved properties while
retaining the reviewed event-specific PickTonight properties.

A fresh local PickTonight session was then exercised after the transformation
was enabled. PostHog Activity showed a representative journey including:

- `consent_responded`
- `app_opened`
- `picker_started`
- `picker_step_completed`
- `context_submitted`
- `recommendation_batch_viewed`
- `recommendation_opened`
- `recommendation_saved`
- `recommendation_rejected`
- `recommendations_refreshed`
- `feedback_submitted`

The fresh `recommendation_opened` event retained the reviewed PickTonight
properties:

- `taxonomy_version`
- `ui_locale`
- `session_id`
- `recommendation_session_id`
- `algorithm_version`
- `recommendation_item_id`
- `media_type`
- `position`

The fresh `context_submitted` event retained only reviewed structured context
properties that were present for that request. The observed example included:

- `taxonomy_version`
- `ui_locale`
- `session_id`
- `recommendation_session_id`
- `algorithm_version`
- `media_type_code`
- `mood_code`
- `maximum_runtime_minutes`
- `watch_region_code`
- `used_typed_input`
- `required_restriction_count`
- `soft_preference_count`

No raw typed preference text was retained.

The inspected post-change events did not expose:

- GeoIP city, country, postal code, latitude, or longitude;
- current URL, host, path, or referrer;
- browser, operating-system, device, or raw user-agent fields;
- screen or viewport dimensions;
- session-entry URL/path/referrer metadata;
- title names;
- TMDB IDs;
- media keys;
- written/free-form feedback;
- raw picker text;
- watchlist payloads.

### Provider-operational properties observed after transformation

PostHog's stored-event UI additionally displayed these provider-operational
properties:

- **Person profile processing flag** = `false`
- **Sent at**
- **Timestamp (deprecated)**

These are not PickTonight custom taxonomy properties.

`Person profile processing flag=false` is intentionally supplied as a transport
privacy control. `Sent at` and the deprecated timestamp are PostHog operational
timing metadata. None of the three contains picker input, recommendation
identity beyond the separate opaque event identifiers, title/TMDB data,
location, URL/referrer, browser/device metadata, or written feedback.

This distinction is important: the Issue #34 allowlist governs PickTonight
custom analytics properties, while provider-required or provider-generated
operational event metadata is documented separately.

### Retired Issue #32 event verification

A PostHog Activity query over the post-change verification window for:

`picktonight_development_analytics_verified`

returned no matching events.

Historical copies may remain from Issue #32, but Issue #34 confirms the event is
no longer emitted by the application.
