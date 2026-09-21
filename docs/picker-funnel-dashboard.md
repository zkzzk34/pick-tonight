# PickTonight picker funnel dashboard

Issue #35 establishes the first pilot-facing PostHog dashboard for measuring
the PickTonight picker and recommendation journey.

## Live dashboard

Dashboard:

`PickTonight — Picker Funnel`

PostHog project:

`PickTonight Development`

Dashboard URL:

`https://us.posthog.com/project/614630/dashboard/2111781`

The dashboard is configured against the current analytics taxonomy version
`3`. Issue #36 changes the version filter only; it does not change the
session-level funnel definitions below.

## Default audience

The saved dashboard defaults are:

- date range: `Last 7 days`;
- `analytics_environment = pilot`;
- `traffic_class = participant`.

Development/internal traffic is used for implementation verification only and
is excluded from the saved pilot-facing view.

The SQL insights inherit dashboard date/property filters through PostHog's
dashboard filter mechanism rather than hard-coding the final audience into
each query.

## Canonical funnel

The canonical funnel is:

1. `picker_started`
2. `context_submitted`
3. `recommendation_batch_viewed`
4. `watch_intent_confirmed`

### Denominator

The canonical denominator is the number of unique PickTonight analytics
`session_id` values that emit `picker_started` during the selected period.

A session is counted at most once per funnel step.

Multiple picker attempts inside the same analytics session are intentionally
collapsed for the MVP pilot dashboard.

The funnel SQL also requires the reached steps to occur in chronological
order.

## Completion and abandonment

Overall completion rate is:

`watch_intent_confirmed sessions / picker_started sessions`

The canonical funnel table includes:

- unique sessions reaching each step;
- conversion from the immediately previous step;
- drop-off count from the immediately previous step;
- conversion from the funnel start.

## Context-to-watch timing

The median context-to-watch metric measures elapsed seconds from:

`context_submitted`

to:

`watch_intent_confirmed`

Completed recommendation journeys are joined with
`recommendation_session_id`.

Journeys without both timestamps, or with invalid reverse timestamp order,
are excluded.

## Request guardrails

The dashboard tracks:

- `recommendation_empty_shown` rate;
- `api_error_shown` rate.

Both use recommendation journeys that reached `context_submitted` as their
denominator.

These guardrails are intentionally separate from
`recommendation_batch_viewed`: an empty recommendation result is not counted
as a viewed recommendation batch.

## Submitted-context breakdowns

The dashboard contains four context-distribution views:

- requested media type via `media_type_code`;
- mood via `mood_code`;
- maximum-runtime bucket;
- UI locale via `ui_locale`.

Runtime buckets are:

- `90 min or less`;
- `91–120 min`;
- `121–150 min`;
- `151+ min`.

These are analytical dashboard buckets and do not change recommendation
product behavior.

## Dashboard tiles

The dashboard contains these eight analytical tiles:

1. `Picker funnel — sessions, conversion, and drop-off`
2. `Overall picker completion rate`
3. `Median context → watch intent time (seconds)`
4. `Recommendation request guardrails — empty & API error rate`
5. `Submitted context — media type`
6. `Submitted context — mood`
7. `Submitted context — runtime bucket`
8. `Submitted context — UI locale`

It also contains a `Metric definitions` text card documenting denominator and
interpretation semantics next to the live metrics.

## Validation performed

The dashboard was originally manually validated with taxonomy-v2
development/internal traffic. Issue #36 advances its eight query filters to
taxonomy v3 so new product events remain in the same canonical funnel.

A completed development/internal journey produced:

- one session at all four canonical funnel steps;
- `100%` overall completion;
- zero funnel drop-off;
- a measurable context-to-watch duration;
- the expected submitted-context segment values.

Filter behavior was then verified explicitly:

1. `analytics_environment = development`,
   `traffic_class = participant` returned no matching session;
2. restoring `traffic_class = internal` restored the validation journey;
3. switching the saved dashboard to
   `analytics_environment = pilot`,
   `traffic_class = participant` returned the expected empty pilot view.

This proves the dashboard audience is controlled through saved dashboard
filters rather than by retaining development-only values as the final view.

### Taxonomy-v3 migration verification — 2026-09-20

Issue #36 changed the taxonomy predicate in all eight analytical queries from
`2` to `3` without changing the funnel, timing, guardrail, or context-segment
definitions.

PostHog then re-ran all eight queries successfully. The saved dashboard still
uses `Last 7 days`, `analytics_environment = pilot`, and
`traffic_class = participant`; its empty/zero result is expected because no
matching taxonomy-v3 participant traffic exists yet. Development/internal data
was not relabeled to populate the pilot view.

## Small-sample interpretation

Pilot samples may initially be small.

Conversion rates, median timing, guardrail rates, and segment distributions
should therefore be treated as directional until sufficient participant
volume exists.

A zero on the saved pilot-facing dashboard means no matching pilot participant
traffic exists in the selected period; it must not be interpreted as evidence
of either successful or unsuccessful picker performance by itself.
