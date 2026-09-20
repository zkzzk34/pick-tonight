# PickTonight recommendation decision dashboard

Issue #36 establishes a pilot-facing PostHog dashboard for describing how
people evaluate displayed recommendations and which actions they take.

The dashboard is descriptive. It does not establish that rank, freshness,
rating confidence, or algorithm version caused an action.

## Live dashboard

Dashboard:

`PickTonight — Recommendation Decisions`

PostHog project:

`PickTonight Development`

Dashboard URL:

`https://us.posthog.com/project/614630/dashboard/2116356`

The dashboard queries analytics taxonomy version `3`.

## Default audience

The saved dashboard defaults are:

- date range: `Last 7 days`;
- `analytics_environment = pilot`;
- `traffic_class = participant`.

Every SQL insight inherits the dashboard's date and property filters through
PostHog's `{filters}` expression. Development/internal traffic may be selected
temporarily for verification, but it is not retained as the saved audience and
is never relabeled as participant traffic.

## Item-exposure denominator

`recommendation_item_shown` is the only item-exposure denominator.

An item is correlated by the opaque in-memory `recommendation_item_id`. The
event contains no title, media key, TMDB ID, release date, rating value, vote
count, provider name, or provider URL.

The main item denominator is:

`distinct recommendation_item_id values on recommendation_item_shown`

This deliberately counts one opaque item once even if an unexpected duplicate
causes it to be shown more than once in the same recommendation journey.

## Decision action metrics

The dashboard includes these six deliberate actions:

| Label | Event |
| --- | --- |
| Detail open | `recommendation_opened` |
| Trailer click | `trailer_clicked` |
| Save | `recommendation_saved` |
| Reject | `recommendation_rejected` |
| Neutral replace | `recommendations_refreshed` |
| Watch intent | `watch_intent_confirmed` |

For each action, two different metrics are shown:

| Metric | Definition | Denominator |
| --- | --- | --- |
| Raw action count | Number of matching action events | None; it is an event count |
| Unique-item reach | Distinct action `recommendation_item_id` values that join to a shown item, divided by distinct shown `recommendation_item_id` values | Distinct shown items |

Raw counts retain repeated deliberate actions. Unique-item reach counts an item
at most once per action, so repeated opens or trailer clicks do not inflate the
rate numerator.

`recommendations_refreshed` describes a successful neutral replacement of the
outgoing item. Rejection-driven replacement is represented by
`recommendation_rejected`, not by an extra refresh event.

`watch_intent_confirmed` records a stated choice, not verified viewing.

## Structured negative signals

Direct rejection and optional follow-up feedback remain separate:

- **Direct rejection distribution:** raw `recommendation_rejected` events,
  grouped by `rejection_reason`. Its share denominator is all direct rejection
  events in the selected audience and period.
- **Optional feedback distribution:** raw `feedback_submitted` events, grouped
  by `feedback_reason`. Its share denominator is all submitted optional
  feedback events in the selected audience and period.

The dashboard does not treat missing optional feedback as a negative reason and
does not combine the two distributions.

## Rank and algorithm breakdowns

Displayed-rank tables group shown-item denominators and action numerators by
the one-based `position` recorded for the exposure/action. If one opaque item
is exposed at more than one position, it may be represented once in each
relevant position row; rows therefore should not be summed into a deduplicated
overall denominator.

Algorithm tables group by the shared `algorithm_version`. The current value is
`recommendation-v3`, but the query does not rewrite historical versions.

Both tables report shown items, raw action counts, and unique-item reach. They
describe observed associations and are not randomized comparisons.

Only actions that join to a taxonomy-v3 shown-item event enter the segmented
tables. This keeps each segment numerator inside its exposure denominator.

## Candidate-evidence breakdowns

Candidate age uses the recommendation engine's canonical codes:

- `recent`
- `established`
- `unknown`

Rating confidence uses the recommendation engine's canonical codes:

- `limited`
- `medium`
- `strong`

For each code, the dashboard reports distinct shown items and unique-item reach
for the six decision actions. Action events are joined to the shown-item event
by opaque `recommendation_item_id`; the underlying title and raw evidence are
not collected.

## Guardrails

### Repeated recommendation guardrail

The repeated-impression rate is:

`recommendation_item_shown events where repeat_status=repeated`

divided by:

`all recommendation_item_shown events`

This is an exposure-level rate, not the main distinct-item decision
denominator. It is shown with both numerator and denominator and should be
interpreted only when impressions exist.

### Provider availability report guardrail

The user-reported unavailability rate among provider-claimed items is:

`distinct claimed shown items with feedback_reason=unavailable`

divided by:

`distinct shown items where provider_claim_status=claimed`

This metric is available only when provider-claimed items were shown. It is a
user-report guardrail, not a verified provider-accuracy rate: optional feedback
can be skipped, and an unavailable report can reflect timing, region, plan,
catalog changes, or misunderstanding.

## Dashboard tiles

The dashboard contains these nine analytical tiles:

1. `Decision actions — counts and unique-item reach`
2. `Direct rejection reasons`
3. `Optional structured feedback reasons`
4. `Decision behavior by displayed rank`
5. `Decision behavior by algorithm version`
6. `Decision behavior by candidate age`
7. `Decision behavior by rating confidence`
8. `Repeated recommendation guardrail`
9. `Provider availability report guardrail`

It also contains a `Metric definitions and interpretation` text card next to
the analytical tiles.

## Validation performed

All nine HogQL queries were compiled and run after dashboard creation. The
saved pilot/participant, last-seven-days view returned the expected empty or
zero results because no matching taxonomy-v3 participant traffic exists yet;
none of the queries returned an execution error.

The saved dashboard was then re-read and confirmed to contain:

- nine analytical tiles plus one metric-definition text card;
- taxonomy version `3` in all nine analytical queries;
- `Last 7 days` as the date default;
- `analytics_environment = pilot`;
- `traffic_class = participant`.

No development/internal event was rewritten or relabeled to populate the
pilot-facing dashboard. Live data validation remains a post-deployment check
once the taxonomy-v3 browser code is running.

## Privacy and interpretation

All queries use only the reviewed taxonomy-v3 property allowlist. The dashboard
does not require autocapture, person profiles, title identity, TMDB data,
free-form text, URLs, raw provider data, or watchlist contents.

Pilot samples may initially be small. Counts, rates, and segment comparisons
are directional and descriptive. A zero on the saved pilot-facing dashboard
means there is no matching pilot/participant activity in the selected period;
it is not evidence that the product has no recommendation-decision behavior.
