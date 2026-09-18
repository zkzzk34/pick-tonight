# Development PostHog integration

- **Status:** Implemented for development verification only
- **Issue:** #32
- **Environment:** development only

## Purpose

Issue #32 connects PickTonight to a dedicated development PostHog project without widening the analytics scope established by Issues #31, #33, and #34.

This integration exists to verify that provider delivery can occur behind PickTonight's consent and identity boundary. It does not define the production product-event taxonomy and does not approve PostHog for a future pilot or production environment.

## Browser configuration

Development uses:

- `VITE_POSTHOG_DEV_PROJECT_TOKEN`
- `VITE_POSTHOG_DEV_HOST`

Only the frontend-safe PostHog project token belongs in the browser variable.

Never place any of the following in a `VITE_` variable:

- a PostHog personal API key;
- an administrative credential;
- an account-level secret;
- another privileged token.

The development project and any future pilot project must remain separate.

## Consent boundary

The PostHog package is included in the development application bundle, but the SDK is not initialized until:

1. the app is running in Vite development mode;
2. valid development PostHog configuration exists;
3. the user has affirmatively allowed analytics; and
4. Issue #31 browser and page-session identifiers are ready.

Before those conditions are satisfied, PickTonight performs no PostHog initialization.

Declining analytics, resetting the analytics choice, or resetting all PickTonight data makes any active development provider instance capture-inert.

PickTonight remains the sole owner of persistent analytics consent. The integration does not call PostHog's persistent opt-in or opt-out APIs.

## Identity boundary

The Issue #31 PickTonight browser ID is bootstrapped into PostHog as the anonymous `distinctID`.

PickTonight does not call `identify()` and does not enable person profiles.

The Issue #31 UUIDv4 page-session identifier is not supplied as PostHog's native session ID. The PickTonight session identifier remains part of PickTonight's own analytics contract.

## Provider storage boundary

The provider is configured with memory persistence and with PostHog persistence disabled.

PickTonight therefore remains the owner of durable browser analytics identity under its existing versioned storage keys.

## Automatic collection boundary

The development provider configuration disables:

- interaction autocapture;
- automatic pageviews;
- automatic pageleaves;
- dead-click capture;
- rage-click capture;
- exception capture;
- heatmaps;
- performance capture;
- session recording;
- surveys;
- web experiments;
- feature-flag requests;
- external dependency loading;
- campaign-parameter persistence;
- referrer persistence;
- request batching;
- beacon delivery;
- person profiles.

Text and element attributes are masked defensively.

Common automatic URL, pathname, referrer, title, search-engine, and keyword properties are denylisted.

Issue #32 originally used a `before_send` gate around its infrastructure verification event. Issue #34 now restricts provider delivery to the reviewed 16-event product taxonomy and applies an exact property allowlist before transmission.

## Retired Issue #32 verification event

> Historical record: Issue #34 retired this infrastructure-only event after
> Issue #32 live verification was complete. It is no longer emitted by the
> application. The reviewed 15-event taxonomy is the active analytics
> vocabulary.

Issue #32 may emit exactly one deliberate development infrastructure event during a page lifetime:

`picktonight_development_analytics_verified`

The event carries no PickTonight free-form product or user properties.

Issue #33 owns the product event taxonomy.

Issue #34 owns final event-property verification.

## IP-data requirement

Client-side JavaScript cannot prevent the network connection itself from exposing network metadata to the receiving infrastructure.

Before live verification, the dedicated development PostHog project must be configured to discard client IP data.

PickTonight does not intentionally add an IP address as an event property and does not derive identity from IP data.

## Manual browser-network verification

Do not commit `.env`, `.env.local`, or real PostHog values.

Create an ignored local environment file with the development project token and ingestion host, then start Vite.

Open the browser developer tools Network panel and filter by the configured PostHog ingestion host.

### Before consent

- reload with analytics undecided;
- verify there is no request to the PostHog host;
- interact with the application;
- verify there is still no PostHog request.

### Decline

- choose `No thanks`;
- continue interacting;
- verify no PostHog request occurs.

### Accept

- reset the analytics choice if needed;
- choose `Allow analytics`;
- verify the development verification event is delivered;
- verify no `/flags` request occurs;
- verify no pageview, pageleave, autocapture, replay, survey, heatmap, exception, or performance event is delivered;
- continue interacting and verify Issue #32 itself sends no second event.

### Withdraw analytics

- use `Reset analytics choice`;
- continue interacting;
- verify no additional provider request is delivered.

### Complete reset

- allow analytics again in a fresh page if required;
- use `Reset all PickTonight data`;
- continue interacting;
- verify no additional provider event is delivered.

Record the development-project verification result before Issue #32 is merged.

## Failure behavior

PostHog is nonessential.

Missing configuration, invalid configuration, ad blocking, network failure, or provider failure must not disable recommendations, watchlist behavior, privacy controls, or future optional personalization.

A provider startup failure may emit a concise development-console warning but must not expose credentials or user-provided content.

## Live development verification — 2026-09-17

Issue #32 was manually verified against the dedicated `PickTonight Development`
PostHog project on US Cloud after the automated implementation gates passed.

Provider-side configuration verified:

- the project is separate from any future pilot or production environment;
- project-level `Discard client IP data` is enabled under the project's Privacy settings;
- only the browser-safe development project token and US ingestion host are provided to the local Vite development environment;
- the ignored local environment file is not tracked by Git.

Browser network verification:

- before an analytics decision, normal PickTonight interaction produced zero requests to the PostHog ingestion host;
- after choosing `No thanks`, continued interaction produced zero PostHog requests;
- after choosing `Allow analytics`, the browser issued one successful `POST` to the PostHog `/e/` ingestion endpoint and received HTTP `200` with `{"status":"OK"}`;
- PostHog Activity confirmed the delivered event was exactly `picktonight_development_analytics_verified`;
- no `$pageview`, `$pageleave`, `$autocapture`, `$exception`, replay, survey, heatmap, or feature-flag event was observed during the Issue #32 verification;
- continued product interaction after consent produced no additional Issue #32 event;
- after `Reset analytics choice`, subsequent product interaction produced no additional PostHog traffic;
- after `Reset all PickTonight data`, subsequent product interaction produced no additional PostHog traffic.

Separate fresh-browser runs created separate pseudonymous browser identities as expected.
No raw preference description, written feedback, user-supplied link, or other
free-form PickTonight user content was intentionally added by Issue #32.

The development verification event is infrastructure-only. Issue #33 remains
responsible for the reviewed product event taxonomy, and Issue #34 remains
responsible for final event-property verification.

## Picker funnel dashboard

Issue #35 adds the first pilot-facing picker funnel dashboard.

Its metric definitions, audience filters, denominator semantics, guardrails,
breakdowns, and validation procedure are documented in
[`picker-funnel-dashboard.md`](./picker-funnel-dashboard.md).
