# PickTonight

PickTonight is a non-commercial entertainment discovery prototype designed to help people choose something to watch in under two minutes. Instead of presenting another enormous catalog, it considers the viewer’s mood, available time, viewing companions, genre preferences, region, and streaming access, then returns exactly three explainable recommendations.

## Project goal

This project will explore whether a short, context-aware recommendation experience can reduce streaming decision fatigue and help viewers reach a confident decision faster.

The finished portfolio project will combine product discovery, user research, recommendation design, behavioral analytics, application development, usability testing, and evidence-based iteration.

## Current status

**Week 2 — Vertical slice**

Current work includes:

- maintaining the discovery evidence, MVP boundaries, and product workflow;
- establishing the React, TypeScript, and Vite application foundation;
- maintaining a browser/shared/server boundary for the local API foundation;
- proving that TMDB credentials remain available only to server-side code;
- preparing the first end-to-end recommendation path.

The repository now includes a minimal responsive application shell and a platform-neutral Node API handler. API routes, recommendation behavior, deployment, analytics, and the remaining user experience will be added through separate backlog issues.

## Local development

PickTonight requires Node.js `24.12+`, which provides stable built-in execution for the erasable TypeScript used by the local API. The application and API foundation were verified with Node.js `v24.16.0` and npm `11.13.0`.

Install the dependencies, then start the API and Vite development servers in separate terminals:

```bash
npm install
npm run dev:api
```

```bash
npm run dev
```

Use the local URL printed by Vite. Browser requests beginning with `/api` are proxied to the Node server at `http://127.0.0.1:4174`; the browser never receives the TMDB credential or the upstream TMDB request. The API currently returns a fixed `501` placeholder until routes are introduced in later issues.

Run `npm run start:api` instead when API file watching is not needed. See the [API-layer documentation](docs/api-layer.md) for its structure, security boundary, and serverless handoff.

Run the automated development checks with:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

`npm test` runs the Vitest browser tests, Node API-foundation tests, and existing mocked TMDB proof tests. Use `npm run test:watch` while developing the React application, and use `npm run format` to apply the repository's formatting rules.

Create and preview a production build with:

```bash
npm run build
npm run preview
```

### Environment variables

Local environment files such as `.env` and `.env.local` are ignored by Git. The committed `.env.example` contains placeholders only and documents the server-only `TMDB_API_READ_TOKEN` name without containing a credential.

Never give a server secret a `VITE_` prefix. Vite exposes variables with that prefix to browser code during bundling. The React application shell does not read the TMDB token directly.

Only modules under `src/server` may read `TMDB_API_READ_TOKEN`. Browser modules live under `src/browser`, while `src/shared` contains environment-neutral code that either side may import. ESLint enforces those import directions, and the browser TypeScript project excludes `src/server`.

## Documentation

- [Product brief](docs/product-brief.md)
- [Product requirements and research boundaries](docs/product-requirements.md)
- [Privacy, local data, and optional analytics](docs/privacy-and-local-data.md)
- [Discovery interview synthesis](docs/discovery-interview-synthesis.md)
- [Low-fidelity product flow](docs/low-fidelity-product-flow.md)
- [TMDB server-only API proof](docs/tmdb-server-only-proof.md)
- [Node API layer](docs/api-layer.md)
- [Discovery interview guide](docs/discovery-interview-guide.md)
- [Discovery interview notes template](docs/discovery-interview-notes-template.md)

Additional research, recommendation, analytics, privacy, and product-review documents will be added as the project develops.

## Working title

PickTonight is a temporary working title. Name and trademark availability will be checked before any domain purchase or significant branding work.

## License

Original project code and documentation are available under the [MIT License](LICENSE). Third-party data, trademarks, logos, posters, and provider information remain subject to their respective owners’ terms.
