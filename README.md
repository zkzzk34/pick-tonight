# PickTonight

PickTonight is a non-commercial entertainment discovery prototype designed to help people choose something to watch in under two minutes. Instead of presenting another enormous catalog, it considers the viewer’s mood, available time, viewing companions, genre preferences, region, and streaming access, then returns exactly three explainable recommendations.

## Project goal

This project will explore whether a short, context-aware recommendation experience can reduce streaming decision fatigue and help viewers reach a confident decision faster.

The finished portfolio project will combine product discovery, user research, recommendation design, behavioral analytics, application development, usability testing, and evidence-based iteration.

## Current status

**Week 2 — Vertical slice**

Current work includes:

* maintaining the discovery evidence, MVP boundaries, and product workflow;
* establishing the React, TypeScript, and Vite application foundation;
* proving that TMDB credentials can remain behind a server-only boundary;
* preparing the first end-to-end recommendation path.

The repository now includes a minimal responsive application shell. Recommendation behavior, the production API, analytics, and the remaining user experience will be added through separate backlog issues.

## Local development

PickTonight currently requires Node.js `20.19+` or `22.12+` on a supported release line. The initial application foundation was verified with Node.js `v24.16.0` and npm `11.13.0`.

Install the dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Use the local URL printed by Vite. The current frontend shell does not require a TMDB credential.

Create and preview a production build with:

```bash
npm run build
npm run preview
```

## Documentation

* [Product brief](docs/product-brief.md)
* [Product requirements and research boundaries](docs/product-requirements.md)
* [Privacy, local data, and optional analytics](docs/privacy-and-local-data.md)
* [Discovery interview synthesis](docs/discovery-interview-synthesis.md)
* [Low-fidelity product flow](docs/low-fidelity-product-flow.md)
* [TMDB server-only API proof](docs/tmdb-server-only-proof.md)
* [Discovery interview guide](docs/discovery-interview-guide.md)
* [Discovery interview notes template](docs/discovery-interview-notes-template.md)

Additional research, recommendation, analytics, privacy, and product-review documents will be added as the project develops.

## Working title

PickTonight is a temporary working title. Name and trademark availability will be checked before any domain purchase or significant branding work.

## License

Original project code and documentation are available under the [MIT License](LICENSE). Third-party data, trademarks, logos, posters, and provider information remain subject to their respective owners’ terms.
