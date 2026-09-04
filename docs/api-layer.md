# Node API layer

## Purpose

The Node API layer is PickTonight's application boundary between browser code and private server configuration. It supplies a request handler that can later be wrapped by the managed serverless platform selected for the pilot, plus a small local Node adapter for development.

Local API scripts require Node.js `24.12+` and use its stable built-in TypeScript type stripping. The server code therefore stays within erasable TypeScript syntax, uses explicit `.ts` import extensions, and remains type-checked by the repository's Node TypeScript project without adding a runtime framework or TypeScript launcher.

This foundation now includes shared recommendation request and response schemas, a strict normalized media-summary schema, a server-side request-body parser, and server-only TMDB result normalization. It does not choose a deployment vendor or expose a recommendation product endpoint. TMDB discovery, endpoint wiring, and pilot deployment remain in their own backlog issues.

## Module boundaries

| Directory | Runtime | Responsibility | Allowed imports |
|---|---|---|---|
| `src/browser` | Browser | React interface and browser-side API calls | Browser packages and `src/shared` |
| `src/shared` | Environment-neutral | Constants and runtime-backed contracts safe for both runtimes | Other shared modules only |
| `src/server` | Node | Request handlers, runtime input validation, local adapters, upstream clients, and private environment access | Node packages and `src/shared` |

The root `src/main.tsx` is the browser entry point. Separate TypeScript include lists keep server modules out of the browser project, and ESLint rejects imports that cross the boundary in the wrong direction.

`src/server/index.ts` exports a side-effect-free request handler: importing it does not start a listener. A future serverless adapter can import that entry point without bringing in the local development server. `src/server/local.ts` owns the long-running Node listener used only for local development.

## Recommendation contract boundary

`src/shared/recommendation-contracts.ts` is the source of truth for recommendation request, response, and invalid-request contracts. TypeScript types are inferred from the runtime schemas so compile-time declarations do not drift from validation behavior.

Recommendation requests are strict objects at every level. A broad `{}` request is valid, but unknown fields are rejected instead of being removed silently.

| Area | Field | Runtime rule |
|---|---|---|
| Hard restrictions | `mediaType` | Optional `movie`, `tv`, or `either` |
| Hard restrictions | `excludedGenreIds` | Optional list of unique positive integer IDs; at most 50 |
| Hard restrictions | `maximumRuntimeMinutes` | Optional positive integer |
| Hard restrictions | `requiredProviderIds` | Optional nonempty list of unique positive integer IDs; at most 50 |
| Soft preferences | `mood` | Optional `relaxed`, `laughing`, `excited`, `thoughtful`, `romantic`, `spooked`, or `surprised` |
| Soft preferences | `preferredGenreIds` | Optional list of unique positive integer IDs; at most 50 |
| Soft preferences | `contentLanguage` | Optional lowercase two-letter code |
| Soft preferences | `originCountry` | Optional uppercase two-letter code |
| Viewing access | `watchRegion` | Optional uppercase two-letter code; required when provider availability is required |

The contract keeps hard restrictions separate from soft ranking preferences. Free-form text, freshness, companion fit, rating confidence, and other not-yet-defined values are not accepted early; their owning issues must first define reviewed structured vocabulary and behavior.

`createRecommendationResponseSchema(itemSchema)` remains the reusable shared response-envelope factory. `recommendationResponseSchema` composes that envelope with `mediaSummarySchema` and permits zero through three normalized items. The later recommendation issue owns the rule for returning exactly three eligible results when possible and reporting an honestly limited result set otherwise.

### Normalized media summaries

`src/shared/media-contracts.ts` defines the strict `mediaSummarySchema` and infers its `MediaSummary` TypeScript type. Movie and television results use one stable shape with `source: "tmdb"` and a `mediaType` of `movie` or `tv`.

TMDB fields that differ by media type are mapped as follows:

| Normalized field | Movie field       | Television field |
| ---------------- | ----------------- | ---------------- |
| `title`          | `title`           | `name`           |
| `originalTitle`  | `original_title`  | `original_name`  |
| `releaseDate`    | `release_date`    | `first_air_date` |

The common allowlist also contains `id`, `overview`, `originalLanguage`, `genreIds`, `posterPath`, `backdropPath`, `popularity`, `voteAverage`, `voteCount`, and `adult`.

`src/server/tmdb-normalization.ts` accepts raw results as `unknown`. It requires a positive integer ID and a nonblank localized title or name. Unusable results throw `TmdbNormalizationError` with a fixed message that does not reflect raw upstream data.

Missing, blank, malformed, or out-of-range optional scalar values become `null`. Missing genre arrays become `[]`, and malformed genre entries are removed. Dates must use `YYYY-MM-DD`; vote averages must be between zero and ten; vote counts and popularity must be nonnegative.

The normalizers construct only allowlisted properties. Raw snake-case fields, origin-country arrays, video flags, and unexpected upstream properties do not cross the boundary. Poster and backdrop values remain relative TMDB paths.

Raw TMDB response shapes and normalization logic remain under `src/server`; browser components receive only `MediaSummary`. These modules perform no network requests, discovery, filtering, candidate deduplication, ranking, route wiring, or public API error translation.

Representative movie and television fixtures verify field mapping, safe missing-value behavior, raw-field rejection, and the zero-through-three response bound.

### Runtime request parsing

`src/server/recommendation-request.ts` parses an untrusted raw body before recommendation logic can use it:

1. an absent or whitespace-only body becomes `MISSING_BODY`;
2. invalid JSON becomes `MALFORMED_JSON`;
3. parsed JSON is checked against the strict shared request schema;
4. schema failures are mapped to `INVALID_TYPE`, `INVALID_VALUE`, `UNSUPPORTED_VALUE`, or `UNKNOWN_FIELD`.

Invalid bodies use the fixed public envelope:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The recommendation request is invalid.",
    "issues": [
      {
        "code": "INVALID_TYPE",
        "path": ["hardRestrictions", "mediaType"]
      }
    ]
  }
}
```

Only mapped codes, known schema paths, and safe numeric array indices are returned. Submitted values, unknown key names, raw Zod messages, caught exceptions, and request bodies are not reflected. At most 20 validation issues are returned for one request.

The parser is not registered as an HTTP route in this issue. The later TMDB discovery issue owns recommendation endpoint wiring and must call this parser before using a request body.

## Run locally

Install dependencies once:

```bash
npm install
```

Start the local API in one terminal:

```bash
npm run dev:api
```

Start Vite in another terminal:

```bash
npm run dev
```

Open the URL printed by Vite. Its development proxy forwards paths beginning with `/api` to `http://127.0.0.1:4174`, so browser code can use same-origin relative paths without CORS configuration or an upstream hostname.

Verify the local API directly or through Vite with `GET /api/health`. A healthy process returns:

```json
{
  "data": {
    "status": "ok"
  }
}
```

Unknown paths return `404` with the `ROUTE_NOT_FOUND` code. Methods other than `GET` on `/api/health` return `405`, include `Allow: GET`, and use the `METHOD_NOT_ALLOWED` code. Error responses always use the same envelope:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "The requested API route was not found."
  }
}
```

The handler sends fixed user-safe messages and never copies request URLs, headers, bodies, caught exceptions, credentials, or upstream response bodies into a client response. The recommendation body parser follows the same non-reflection rule but is intentionally not registered as an HTTP product route yet.

Use this command when file watching is unnecessary:

```bash
npm run start:api
```

Stop either development process with `Ctrl+C`.

## Server-only configuration

Local `.env` files remain ignored by Git. `src/server/environment.ts` is the only application module that reads `TMDB_API_READ_TOKEN`, validates that it is a raw non-placeholder value, and returns a user-safe configuration error without reflecting the supplied value.

Do not import server modules from browser code, add a `VITE_` prefix to the token, log the token or request headers, or return caught exception details to a client. The API handler returns only fixed health or error responses and never reflects request URLs, headers, or bodies.

The current health route does not call TMDB, so the local API can start without a token. A valid ignored `.env` value will be required when TMDB-backed application routes are implemented.

## Verification

Run all project checks:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

The API tests verify the health response, standardized `404` and `405` errors, strict shared schemas, valid and invalid request parsing, bounded safe issue mapping, non-reflection of request details, and raw token validation. The existing TMDB proof tests continue to verify the authenticated upstream request, normalization allowlist, timeout behavior, and sanitized failures.
