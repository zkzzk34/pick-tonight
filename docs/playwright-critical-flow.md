# Critical Playwright flow

Issue #39 protects the primary PickTonight visitor journey with a deterministic
Chromium browser test.

## Scope

The suite covers three isolated scenarios:

1. landing-page entry with optional analytics declined;
2. the accepted-consent critical journey from picker input through watch intent;
3. a recoverable recommendation-request failure followed by a successful retry.

The successful journey verifies:

- representative structured preferences;
- exactly three ordered recommendation cards;
- title-detail open/close behavior without losing the active decision;
- local watchlist save and removal;
- rejection and a nonduplicate replacement;
- explicit watch-intent completion.

## Deterministic recommendation boundary

The current PickTonight browser prototype normally returns the existing fixed
local recommendation preview. Issue #39 does not replace that product behavior
with a production API integration.

When and only when:

`VITE_PICKTONIGHT_E2E_API=1`

the browser requester uses:

`POST /api/e2e/recommendations`

That route is an E2E test seam, not a deployed production endpoint.

Playwright intercepts the route and fulfills it from checked-in fixed fixtures.
The test therefore exercises a real browser HTTP request and recovery path
without contacting TMDB or a recommendation service.

Production recommendation/API deployment remains separate work.

## Analytics isolation

The Playwright web server is started with:

`VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT=test`

PickTonight's analytics runtime therefore resolves to the automated-test
environment, which is provider-disabled.

The Playwright suite additionally blocks every browser HTTP(S) request whose
host is not `127.0.0.1` or `localhost`. Any attempted external request is
recorded only as origin plus pathname and fails the test assertion.

This gives the suite a second guard against accidental PostHog delivery without
collecting or persisting query strings.

## Locators

Critical-flow tests use user-facing roles, labels, accessible names, headings,
regions, and status messages. They do not depend on styling classes or DOM
structure selectors.

## Browser scope

Issue #39 runs only Chromium.

Cross-browser Chromium, Firefox, and WebKit compatibility belongs to Issue #40,
which owns the supported browser and viewport matrix.

## Artifacts

Playwright is configured with:

- screenshots only on failure;
- traces retained only on failure;
- video disabled.

GitHub Actions uploads `test-results/` and `playwright-report/` only when the
critical-flow job fails.

The workflow does not inject application secrets, TMDB credentials, PostHog
administrative credentials, or participant data. Fixed fixtures contain only
synthetic PickTonight recommendation data.

## Local commands

Install the Playwright Chromium browser once:

```sh
npx playwright install chromium
```

Run the critical flow:

```sh
npm run test:e2e
```

Run visibly during local debugging:

```sh
npm run test:e2e:headed
```
