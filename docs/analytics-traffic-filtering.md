# PickTonight analytics traffic filtering

Issue: #38 — Filter internal and test traffic

## Objective

Keep development, automated-test, preview, and known internal activity out of
pilot participant analysis without collecting identifying information solely
for exclusion.

The current PostHog account supports one physical project. PickTonight therefore
uses explicit event-property partitioning inside that project.

## Environment contract

Every consented PickTonight event carries one reviewed
`analytics_environment` value:

- `development`
- `test`
- `preview`
- `pilot`

Automated-test mode has highest precedence.

A generic production build is not automatically considered pilot traffic.
Without an explicit reviewed pilot environment, it fails closed to `preview`.

## Traffic-class contract

Every consented event also carries one reviewed `traffic_class`:

- `internal`
- `participant`

Default mapping:

| Environment | Traffic class |
| --- | --- |
| development | internal |
| test | internal |
| preview | internal |
| pilot | participant |

An explicitly marked pilot session becomes `pilot / internal`.

Only an unmarked pilot session may become participant traffic.

## Provider delivery

The single configured PickTonight PostHog project receives:

| Classification | Provider behavior |
| --- | --- |
| development / internal | deliver |
| preview / internal | deliver |
| pilot / internal | deliver |
| pilot / participant | deliver |
| test / internal | do not initialize or deliver |

The existing `VITE_POSTHOG_DEV_PROJECT_TOKEN` and
`VITE_POSTHOG_DEV_HOST` names remain for compatibility with the current local
configuration. They configure the single physical PickTonight PostHog project.

The analysis boundary is provided by the reviewed
`analytics_environment` and `traffic_class` event properties.

## Internal pilot sessions

A known internal tester may deliberately open a pilot build with:

`?picktonight_internal=1`

Before analytics consent, PickTonight removes the query parameter from the
visible URL and keeps the requested classification only in transient
application memory.

No analytics `sessionStorage` state is established before consent.

After affirmative analytics consent, PickTonight stores only a tab-scoped
boolean marker in `sessionStorage`.

The resulting consented events use:

- `analytics_environment = pilot`
- `traffic_class = internal`

The marker contains no name, email address, IP address, device fingerprint,
browser fingerprint, provider identity, geography, or network identity.

Opening:

`?picktonight_internal=0`

provides the deterministic marker-clear path.

`Reset analytics choice` and `Reset all PickTonight data` also remove the
internal-session marker.

## Pilot dashboards

Both pilot-facing dashboards use exactly:

- `analytics_environment = pilot`
- `traffic_class = participant`

This applies to:

- `PickTonight — Picker Funnel`
- `PickTonight — Recommendation Decisions`

Development, preview, test, and explicitly internal pilot activity are outside
that audience.

No pilot exclusion rule may rely on browser, operating system, geography,
provider, network, IP address, or device fingerprint.

## Internal analysis

Useful internal traffic remains available in the same physical project.

Development analysis uses:

- `analytics_environment = development`
- `traffic_class = internal`

Preview analysis uses:

- `analytics_environment = preview`
- `traffic_class = internal`

Controlled pilot verification uses:

- `analytics_environment = pilot`
- `traffic_class = internal`

## Controlled synthetic verification

Synthetic verification must remain non-participant traffic.

Allowed classifications include:

- development / internal
- preview / internal
- pilot / internal
- test / internal in deterministic tests, with no provider delivery

Synthetic activity must never be relabeled as `pilot / participant` simply to
populate a dashboard.

A genuine participant ingestion smoke test remains a separate post-deployment
step.

## Limitation

The internal query marker is an operational convention, not authentication.

A person who deliberately knows the marker could classify that tab as
internal. For this bounded prototype, that tradeoff avoids collecting identity
or fingerprint information only for analytics exclusion.

## Live PostHog verification — September 22, 2026

Issue #38 was verified against the live PickTonight PostHog project after the
single-project architecture was selected.

### Project privacy

PostHog project setting `Discard client IP data` was enabled before the
controlled internal verification session.

The browser provider continues to disable automatic pageviews, page leaves,
autocapture, exception capture, heatmaps, session recording, surveys, feature
flags, persistent PostHog identity, and person profiles.

### Controlled pilot/internal session

A controlled synthetic pilot session used the explicit internal-session marker.

Verified analytics session:

`1c8caf0b-9d8a-4ab8-9372-99d6b1c8cf71`

Activity showed the session as:

- `analytics_environment = pilot`
- `traffic_class = internal`

The session emitted normal picker and recommendation-decision activity,
including consent, app-open, picker, recommendation exposure, open, save,
reject, and refresh events.

Filtering Activity to:

- `analytics_environment = pilot`
- `traffic_class = participant`
- `session_id = 1c8caf0b-9d8a-4ab8-9372-99d6b1c8cf71`

returned zero matching events.

This verifies that the controlled synthetic internal session cannot satisfy the
participant audience merely because it uses the same browser, PostHog project,
provider configuration, region, or network as other traffic.

### Synthetic participant contamination quarantine

During manual verification, two synthetic sessions were accidentally emitted as
`pilot / participant` before the internal-session marker was confirmed:

- `832deb6a-737e-466c-8aaa-385ade410b97`
- `d3536285-87c5-43c3-9d5e-fab01efb87c6`

These sessions are test contamination and must never be interpreted as genuine
pilot participants.

Both pilot-facing dashboards therefore retain their canonical audience:

- `analytics_environment = pilot`
- `traffic_class = participant`

and additionally exclude those two known synthetic `session_id` values using a
`session_id doesn't equal` filter.

This quarantine is limited to the known opaque synthetic session IDs. It does
not exclude traffic by name, email, browser, operating system, device,
provider, geography, IP address, network, or fingerprint.

### Pilot dashboards

The following saved dashboards use the same pilot audience and synthetic
quarantine:

- `PickTonight — Picker Funnel`
- `PickTonight — Recommendation Decisions`

### Internal development view

A separate saved dashboard was created:

`PickTonight — Internal Analytics QA`

Its dashboard audience is:

- `analytics_environment = development`
- `traffic_class = internal`

It includes an `Internal event volume` insight so development/internal activity
remains useful without entering pilot analysis.

### Remaining deployment verification

A genuine `pilot / participant` ingestion smoke test remains intentionally
deferred until real participant deployment activity exists.

Synthetic traffic must not be relabeled as genuine participant traffic to
satisfy that future check.
