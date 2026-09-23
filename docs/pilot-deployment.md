# PickTonight pilot deployment

Issue #41 deploys PickTonight through Vercel.

## Platform

The Vercel deployment contains:

- the Vite browser application;
- GET /api/health;
- POST /api/recommendations;
- GET /api/titles/:mediaType/:id;
- server-only TMDB integration.

Browser recommendation requests use same-origin /api routes.

The TMDB API Read Access Token is never sent to the browser.

## Environment model

### Development

Local development uses ignored environment files.

TMDB_API_READ_TOKEN is server-only.

The browser uses the existing frontend-safe PostHog project token and ingestion
host.

### Preview

Required Vercel Preview variables:

- TMDB_API_READ_TOKEN — Secret
- VITE_POSTHOG_DEV_PROJECT_TOKEN — Config
- VITE_POSTHOG_DEV_HOST — Config
- VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT — Config value preview

Preview deployments are used for deployment verification before promotion.

### Production pilot

Required Vercel Production variables:

- TMDB_API_READ_TOKEN — Secret
- VITE_POSTHOG_DEV_PROJECT_TOKEN — Config
- VITE_POSTHOG_DEV_HOST — Config
- VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT — Config value pilot

The VITE_ PostHog values are deliberately browser-visible frontend
configuration.

No PostHog personal API key or administrative credential belongs in a VITE_
variable.

## Secret boundary

Never commit:

- .env
- .env.local
- .env.*.local
- .vercel local project metadata

Never expose TMDB_API_READ_TOKEN using a VITE_ variable.

Never send the TMDB token from browser JavaScript.

.vercelignore explicitly excludes local environment files from Vercel source
uploads.

## Release validation

Before release, verify:

- production build;
- application tests;
- server tests;
- TMDB boundary proofs;
- accessibility regression;
- critical Chromium, Firefox, and WebKit Playwright flow;
- HTTPS;
- health endpoint;
- standardized API errors;
- three real recommendations;
- current title details;
- save behavior;
- rejection and unseen replacement;
- watch intent;
- analytics decline produces no PostHog traffic;
- analytics acceptance produces reviewed PostHog traffic;
- TMDB credential is absent from browser assets and requests.

## Preview deployment

Dry-run command:

    npx --yes vercel@latest deploy --dry --yes

Preview deployment command:

    npx --yes vercel@latest deploy --target=preview --yes

The explicit Preview target is intentional. Vercel automatically assigns the
first deployment of a newly created project to Production, so release
automation must not rely on the implicit target during project bootstrap.

Deployment inspection:

    npx --yes vercel@latest inspect DEPLOYMENT_URL --wait

Protected Preview API testing:

    npx --yes vercel@latest curl /api/health --deployment DEPLOYMENT_URL

## Production promotion

Production promotion occurs only after the Preview deployment passes the
deployed smoke tests.

Public pilot URL: https://pick-tonight.vercel.app

Verified Preview URL: https://pick-tonight-nbtfvqmpz-pick-tonight.vercel.app

Production deployment ID: dpl_4nkc7Pphdyv3QyA9Cc5xvoDc1GF9

Release source commit: d0a4a069e7c6c5116b598682411277b36b2743c0

The Production build uses
`VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT=pilot`.

Issue #41 does not purchase a custom domain and does not make final branding
claims for the PickTonight working title.

## Verified pilot release

The Issue #41 pilot release was validated on September 23, 2026.

Deployment verification confirmed:

- the public pilot domain resolves to the verified Production deployment;
- the Production browser bundle uses the `pilot` analytics environment;
- HTTPS and `GET /api/health` succeed;
- standardized API errors are returned for unsupported methods;
- live TMDB-backed recommendations return three unique titles with posters;
- live title-detail enrichment succeeds;
- rejection returns an unseen replacement;
- save, reject/replacement, and watch-intent browser flows succeed;
- the TMDB API Read Access Token is absent from the public browser bundle,
  recommendation responses, and title-detail responses;
- declining analytics sends zero PostHog requests;
- accepting analytics sends reviewed events successfully to the configured
  PostHog ingestion host;
- PostHog ingestion independently contains `consent_responded`, `app_opened`,
  `picker_started`, and `picker_step_completed` with
  `analytics_environment=pilot` and `traffic_class=internal`;
- no Production runtime errors were found during the release smoke test.

### Automated analytics verification

PostHog intentionally filters browser automation such as headless browsers and
sessions exposing `navigator.webdriver=true`.

The controlled deployment smoke therefore uses a normal Chrome user agent and
`navigator.webdriver=false` only inside the verification browser. The
PickTonight application does not disable PostHog bot filtering.

The verification session also uses `picktonight_internal=1` so release testing
is classified as internal traffic rather than participant traffic.

## Rollback

If the pilot deployment becomes unhealthy:

1. Inspect recent Production runtime errors.
2. Roll back to the last known-good Production deployment.
3. Confirm rollback status.
4. Re-run the health endpoint and critical product journey.
5. Fix the cause in a new Preview deployment.
6. Revalidate Preview before returning the fix to Production.

Useful commands:

    npx --yes vercel@latest logs --environment production --status-code 5xx --since 30m
    npx --yes vercel@latest rollback
    npx --yes vercel@latest rollback status
