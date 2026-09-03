# Node API layer

## Purpose

The Node API layer is PickTonight's application boundary between browser code and private server configuration. It supplies a request handler that can later be wrapped by the managed serverless platform selected for the pilot, plus a small local Node adapter for development.

Local API scripts require Node.js `24.12+` and use its stable built-in TypeScript type stripping. The server code therefore stays within erasable TypeScript syntax, uses explicit `.ts` import extensions, and remains type-checked by the repository's Node TypeScript project without adding a runtime framework or TypeScript launcher.

This foundation does not choose a deployment vendor or implement product endpoints. The health route and standard error contract, runtime request schemas, media normalization, TMDB discovery, and pilot deployment remain in their own backlog issues.

## Module boundaries

| Directory | Runtime | Responsibility | Allowed imports |
|---|---|---|---|
| `src/browser` | Browser | React interface and browser-side API calls | Browser packages and `src/shared` |
| `src/shared` | Environment-neutral | Constants and later contracts safe for both runtimes | Other shared modules only |
| `src/server` | Node | Request handlers, local adapters, upstream clients, and private environment access | Node packages and `src/shared` |

The root `src/main.tsx` is the browser entry point. Separate TypeScript include lists keep server modules out of the browser project, and ESLint rejects imports that cross the boundary in the wrong direction.

`src/server/index.ts` exports a side-effect-free request handler: importing it does not start a listener. A future serverless adapter can import that entry point without bringing in the local development server. `src/server/local.ts` owns the long-running Node listener used only for local development.

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

The foundation currently answers API requests with a fixed `501` JSON placeholder. This deliberately leaves the health route, standardized errors, request validation, and TMDB-backed routes for their dedicated issues.

Use this command when file watching is unnecessary:

```bash
npm run start:api
```

Stop either development process with `Ctrl+C`.

## Server-only configuration

Local `.env` files remain ignored by Git. `src/server/environment.ts` is the only application module that reads `TMDB_API_READ_TOKEN`, validates that it is a raw non-placeholder value, and returns a user-safe configuration error without reflecting the supplied value.

Do not import server modules from browser code, add a `VITE_` prefix to the token, log the token or request headers, or return caught exception details to a client. The placeholder handler returns only a fixed response and never reflects request URLs, headers, or bodies.

The current placeholder route does not call TMDB, so the local API can start without a token. A valid ignored `.env` value will be required when TMDB-backed application routes are implemented.

## Verification

Run all project checks:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

The API tests verify raw token validation and confirm that the placeholder response cannot reflect request details. The existing TMDB proof tests continue to verify the authenticated upstream request, normalization allowlist, timeout behavior, and sanitized failures.
