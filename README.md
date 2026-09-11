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
- maintaining a browser/shared/server boundary with shared recommendation contracts and runtime validation;
- normalizing TMDB movie and television results into one strict shared media summary;
- retrieving, filtering, and combining movie and television candidates through a server-only TMDB discovery pipeline;
- proving that TMDB credentials remain available only to server-side code;
- presenting an accessible three-card browser preview without widening the server boundary;
- managing explicit browser loading, empty, safe failure, duplicate-submission, and same-preference retry states without adding live networking.
- maintaining accessible in-application Credits for TMDB data and images and JustWatch watch-provider availability.

The repository now includes the application and API foundations, strict shared recommendation contracts, server-side parsing and normalization, a server-only TMDB candidate-discovery pipeline, versioned mood mapping, deterministic filtering and selection, focused engine tests, an accessible recommendation-card presentation, and an injected browser request-state controller. The browser shows a clearly labeled non-live three-card preview, prevents concurrent duplicate requests, announces loading and empty states, maps supported failure categories to fixed user-safe copy, and retries a detached snapshot of the last submitted preferences. Its request control resolves the fixed local sample and performs no direct TMDB request. HTTP product-route wiring, server-side display enrichment, deterministic fit-explanation generation, durable action semantics, analytics, personalization, and deployment remain separate backlog work. See the [recommendation v1 contract](./docs/recommendation-v1.md), [recommendation-card contract](./docs/recommendation-cards.md), and [recommendation request-state contract](./docs/recommendation-request-states.md).

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

Use the local URL printed by Vite. Browser requests beginning with `/api` are proxied to the Node server at `http://127.0.0.1:4174`; the browser never receives the TMDB credential or the upstream TMDB request. `GET /api/health` returns the operational status, while unknown routes and unsupported methods return standardized user-safe JSON errors.

Run `npm run start:api` instead when API file watching is not needed. See the [API-layer documentation](docs/api-layer.md) for its structure, shared contracts, runtime validation, security boundary, and serverless handoff.

Run the automated development checks with:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

`npm test` runs browser, API, contract, request-validation, discovery, and TMDB boundary tests. Automated TMDB tests use injected clients and mocked responses; they do not call the live TMDB API. Use `npm run test:watch` while developing the React application, and use `npm run format` to apply the repository's formatting rules.

Create and preview a production build with:

```bash
npm run build
npm run preview
```

### Environment variables

Local environment files such as `.env` and `.env.local` are ignored by Git. The committed `.env.example` contains placeholders only and documents the server-only `TMDB_API_READ_TOKEN` name without containing a credential.

Never give a server secret a `VITE_` prefix. Vite exposes variables with that prefix to browser code during bundling. The React application shell does not read the TMDB token directly.

Only modules under `src/server` may read `TMDB_API_READ_TOKEN`. Browser modules live under `src/browser`, while `src/shared` contains environment-neutral code that either side may import. ESLint enforces those import directions, and the browser TypeScript project excludes `src/server`.

## Data, images, and attribution

PickTonight identifies the external sources behind entertainment metadata, artwork, branding, and regional watch-provider availability. The application's footer links to an accessible Credits section containing the required TMDB notice and source links.

| Material                             | Source and current boundary                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movie and television metadata        | [TMDB](https://www.themoviedb.org/) is the source used by the server-only discovery and normalization layers. Raw upstream responses and credentials do not cross into browser code.                                                                                 |
| Posters and backdrops                | Image paths originate from the [TMDB API](https://developer.themoviedb.org/docs/image-basics). The current browser preview uses local placeholder data and does not construct or display live TMDB artwork. Later display enrichment must preserve TMDB attribution. |
| Regional watch-provider availability | The TMDB watch-provider endpoints identify [JustWatch](https://www.justwatch.com/) as the underlying source. Every populated PickTonight provider display places a branded JustWatch link beside the availability data.                                              |
| TMDB brand mark                      | `public/tmdb-logo.svg` is an unmodified approved blue-square TMDB logo displayed at its original 512 × 369 aspect ratio and at lower prominence than the PickTonight identity.                                                                                       |

> This product uses the TMDB API but is not endorsed or certified by TMDB.

### TMDB logo provenance

The local TMDB asset is the unmodified 2,577-byte SVG retrieved from the [Wikimedia Commons mirror record](https://commons.wikimedia.org/wiki/File:Tmdb.new.logo.svg). That record identifies Travis Bell as the author and the [official TMDB blue-square asset](https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg) as its source. Wikimedia lists the file under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The committed file's verification values are:

- dimensions: 512 × 369;
- size: 2,577 bytes;
- SHA-1: `d6f7f0323283bf92471217d16e517181ff203cbf`.

The logo is not recolored, cropped, stretched, flipped, rotated, or used to imply that TMDB endorses PickTonight. CSS only reduces its displayed width and retains automatic proportional height.

### JustWatch attribution boundary

TMDB documents that its regional watch-provider availability is powered by JustWatch and requires JustWatch source attribution. A recommendation card renders the branded JustWatch link only when usable regional provider data is present. The application-level Credits section provides the durable source explanation.

PickTonight does not call the JustWatch API directly. The current browser preview also performs no live TMDB or JustWatch request and contains no live provider availability.

## Documentation

- [Product brief](docs/product-brief.md)
- [Product requirements and research boundaries](docs/product-requirements.md)
- [Privacy, local data, and optional analytics](docs/privacy-and-local-data.md)
- [Discovery interview synthesis](docs/discovery-interview-synthesis.md)
- [Low-fidelity product flow](docs/low-fidelity-product-flow.md)
- [TMDB server-only API proof](docs/tmdb-server-only-proof.md)
- [Node API layer](docs/api-layer.md)
- [Recommendation v1 heuristics and boundaries](docs/recommendation-v1.md)
- [Recommendation card presentation](docs/recommendation-cards.md)
- [Recommendation request states](docs/recommendation-request-states.md)
- [Discovery interview guide](docs/discovery-interview-guide.md)
- [Discovery interview notes template](docs/discovery-interview-notes-template.md)

Additional research, recommendation, analytics, privacy, and product-review documents will be added as the project develops.

## Working title

PickTonight is a temporary working title. Name and trademark availability will be checked before any domain purchase or significant branding work.

## License

Original project code and documentation are available under the [MIT License](LICENSE). Third-party data, trademarks, logos, posters, and provider information remain subject to their respective owners’ terms.
