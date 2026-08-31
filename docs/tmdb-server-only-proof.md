# TMDB server-only API proof

## Purpose

This proof verifies that PickTonight can request and normalize one movie from TMDB without exposing the API Read Access Token to browser code or browser network requests.

It is a Week 1 feasibility check, not the production application boundary. It deliberately uses only Node.js built-ins so it does not choose the later application framework, deployment platform, or production observability design.

## Boundary under test

The browser requests `GET /api/tmdb-proof` from a local Node server. The Node server sends an authenticated request to `https://api.themoviedb.org/3/movie/popular`, normalizes the first result through an explicit field allowlist, and returns only that normalized object.

The browser never receives:

- `TMDB_API_READ_TOKEN`;
- an `Authorization` header;
- the direct TMDB API request; or
- the raw TMDB response.

The proof binds to `127.0.0.1` by default and does not implement a deployable public service.

## Files

| File | Responsibility |
|---|---|
| `proofs/tmdb-server-only/client.mjs` | Server-only TMDB authentication, timeout, response validation, and movie normalization |
| `proofs/tmdb-server-only/server.mjs` | Local HTTP server and sanitized browser-facing endpoint |
| `proofs/tmdb-server-only/index.html` | Browser verification page with no credential or direct TMDB request |
| `proofs/tmdb-server-only/browser.js` | Same-origin request to the local proof endpoint |
| `proofs/tmdb-server-only/client.test.mjs` | Authentication, normalization, timeout, and upstream-error tests |
| `proofs/tmdb-server-only/server.test.mjs` | Browser-boundary and sanitized-response tests |
| `proofs/tmdb-server-only/verify-secret-boundary.mjs` | Exact-token scan across project files and Git objects without printing the token |

## Credential setup

Register a non-commercial TMDB developer application from a desktop browser, review the current terms, and copy the value labeled **API Read Access Token**.

The project owner confirmed completion of the non-commercial registration and acceptance of the then-current terms on August 31, 2026. No account contact details, API key, or API Read Access Token are recorded in this repository.

Create the ignored local file from the committed placeholder:

```bash
cp .env.example .env
```

Edit `.env` locally:

```dotenv
TMDB_API_READ_TOKEN=replace_with_your_real_api_read_access_token
```

Store only the raw token. Do not add the `Bearer ` prefix; the server adds it when constructing the upstream `Authorization` header.

Never:

- commit `.env`;
- use a browser-exposed prefix such as `VITE_`;
- place the token in a URL or query string;
- pass the token as a terminal command argument;
- paste it into an issue, pull request, chat, screenshot, log, or test fixture; or
- print request headers or environment variables while debugging.

## Automated verification

The tests use a fake token and mocked TMDB responses. They do not read `.env` or call the live API.

Run:

```bash
node --test proofs/tmdb-server-only/*.test.mjs
```

The tests verify:

- the Bearer header exists only on the server-to-TMDB request;
- the popular-movie URL uses explicit language and region parameters;
- normalization returns only the documented movie fields;
- the token does not enter normalized output, browser assets, or endpoint responses;
- `/.env` is not served;
- missing configuration is rejected before a network call;
- authentication, upstream, invalid-response, empty-result, timeout, and network failures receive distinct friendly errors; and
- raw upstream error details are not returned to the browser.

With the real token configured locally, run the boundary scanner:

```bash
node --env-file=.env proofs/tmdb-server-only/verify-secret-boundary.mjs
```

The scanner prints no credential. It verifies that:

- `.env` matches an ignore rule;
- the exact token is absent from non-ignored project files;
- the exact token is absent from Git blob objects; and
- browser assets contain no credential variable, authorization header, or direct TMDB API hostname.

## Live proof

Start the local server:

```bash
node --env-file=.env proofs/tmdb-server-only/server.mjs
```

Expected startup output:

```text
TMDB server-only proof listening at http://127.0.0.1:4173
The API Read Access Token remains in the Node server process.
```

Open `http://127.0.0.1:4173`, then select **Request normalized movie**. The page should display one normalized movie object.

Stop the server with `Ctrl+C` after verification.

### Browser-source check

Use **View page source** and inspect the loaded `/proof.js` asset. Confirm that neither contains:

- `TMDB_API_READ_TOKEN`;
- `Authorization`; or
- `api.themoviedb.org`.

Do not search for or paste the real token into browser tools.

### Browser-network check

1. Open Developer Tools and select **Network**.
2. Clear existing entries.
3. Select **Request normalized movie**.
4. Confirm the browser makes one data request to the local path `/api/tmdb-proof`.
5. Confirm there is no browser request to `api.themoviedb.org`.
6. Inspect the local request headers and confirm there is no `Authorization` header.
7. Inspect the response and confirm it contains only `movie` with normalized fields and no raw TMDB envelope.

The server-to-TMDB request is intentionally not visible in the browser network panel.

## Normalized movie contract

The proof returns this allowlisted shape:

| Field | Type | Meaning |
|---|---|---|
| `source` | `"tmdb"` | Source identifier |
| `mediaType` | `"movie"` | Normalized media type |
| `id` | integer | TMDB movie identifier |
| `title` | string | Localized title |
| `originalTitle` | string or `null` | Original title when supplied |
| `overview` | string or `null` | Source-backed overview |
| `releaseDate` | string or `null` | Supplied release date |
| `originalLanguage` | string or `null` | TMDB language code |
| `genreIds` | integer array | Source genre identifiers |
| `posterPath` | string or `null` | Relative TMDB poster path |
| `backdropPath` | string or `null` | Relative TMDB backdrop path |
| `popularity` | number or `null` | TMDB popularity value without a quality claim |
| `voteAverage` | number or `null` | TMDB vote average |
| `voteCount` | integer or `null` | TMDB vote count for rating context |
| `adult` | boolean or `null` | Supplied adult-content flag |

This proof does not construct image URLs, infer mood or quality, request providers, or rank recommendations.

## Error behavior

| Code | Browser message category | HTTP status |
|---|---|---:|
| `CONFIGURATION_ERROR` | Server credential or runtime configuration is missing | 500 |
| `AUTHENTICATION_ERROR` | TMDB rejected the server credential | 502 |
| `UPSTREAM_TIMEOUT` | TMDB exceeded the five-second timeout | 504 |
| `UPSTREAM_ERROR` | TMDB returned another unsuccessful status | 502 |
| `NETWORK_ERROR` | The server could not reach TMDB | 502 |
| `INVALID_RESPONSE` | The upstream payload was unreadable or unusable | 502 |
| `NO_RESULTS` | The proof request returned no movies | 502 |

Messages never include the credential, request headers, raw upstream payload, or upstream status message.

## Attribution requirements

TMDB's current requirements must be checked again before deployment. At the time of this proof:

- the application must use an approved TMDB logo in an About or Credits area;
- the logo must not imply endorsement and must be less prominent than PickTonight branding;
- the application must include: "This product uses the TMDB API but is not endorsed or certified by TMDB.";
- references should use **TMDB** or **The Movie Database** and link to `https://www.themoviedb.org`; and
- TMDB data remains subject to TMDB's terms rather than this repository's MIT license.

Watch-provider data is not requested in this proof. If PickTonight later uses TMDB watch-provider endpoints:

- availability must remain associated with the selected country;
- streaming, free, advertising-supported, rental, and purchase categories must not be collapsed when the source distinguishes them;
- missing provider data must not be presented as confirmed unavailability;
- the supplied TMDB destination URL may be used when direct provider links are unavailable; and
- the interface must visibly attribute provider data to **JustWatch**.

Official references:

- [TMDB application authentication](https://developer.themoviedb.org/docs/authentication-application)
- [TMDB popular movies endpoint](https://developer.themoviedb.org/reference/movie-popular-list)
- [TMDB FAQ and attribution requirements](https://developer.themoviedb.org/docs/faq)
- [TMDB watch providers endpoint and JustWatch requirement](https://developer.themoviedb.org/reference/movie-watch-providers)
- [TMDB approved logos and attribution](https://www.themoviedb.org/about/logos-attribution)

## Acceptance evidence

| Issue #7 acceptance criterion | Evidence |
|---|---|
| Register the non-commercial application and accept current terms | Project-owner confirmation dated August 31, 2026; no personal registration details or credential are committed |
| Keep the API Read Access Token in ignored local or server configuration | `.env.example`, `.gitignore`, setup instructions, and boundary scanner |
| Send the token as a server-side Bearer header | `client.mjs` and the mocked request assertion |
| Request and normalize at least one movie through server-only code | Local `/api/tmdb-proof` path and live proof procedure |
| Add timeout and friendly upstream or authentication handling | Five-second abort plus typed sanitized errors and tests |
| Verify browser source, network requests, and Git history do not expose the token | Browser checklist, boundary tests, and exact-token Git-object scanner |
| Document required TMDB and JustWatch attribution | Attribution requirements in this document and notice on the proof page |

Live API success and the manual browser checks must be recorded before Issue #7 is closed. Do not commit the returned movie payload or any screenshot containing account credentials.
