# Recommendation heuristic v1

## Status and purpose

`recommendation-v1` is PickTonight's initial, reviewable mood-mapping configuration. It translates the seven supported mood values into soft genre or discovery signals that a later scoring heuristic can consume.

The configuration is an explicit product hypothesis, not a validated emotional-classification model. TMDB genres describe catalog categories; they do not guarantee tone, intensity, humor, romance, fear, or an ending. PickTonight must not present these mappings as promises about how a title will make someone feel.

The typed source is `src/server/mood-mapping.ts`. Supported mood values remain defined by `SUPPORTED_MOODS` in `src/shared/recommendation-contracts.ts`, and the mapping's version identifier is `recommendation-v1`.

## Initial mapping assumptions

TMDB maintains separate official [movie genre](https://developer.themoviedb.org/reference/genre-movie-list) and [television genre](https://developer.themoviedb.org/reference/genre-tv-list) catalogs. A signal therefore records the media types for which its genre ID is valid.

| Mood | Movie signals | Television signals | Initial reasoning and limitation |
| --- | --- | --- | --- |
| `relaxed` | Animation (16), Family (10751), Music (10402) | Animation (16), Family (10751) | These are broad proxies for familiar, imaginative, or potentially easygoing viewing; individual titles may still be intense. |
| `laughing` | Comedy (35) | Comedy (35) | Comedy is the clearest catalog-level humor proxy, but a genre label cannot guarantee that every viewer will find a title funny. |
| `excited` | Action (28), Adventure (12), Thriller (53) | Action & Adventure (10759) | Action, momentum, spectacle, and suspense are used as energy proxies rather than promises of excitement. |
| `thoughtful` | Drama (18), Documentary (99), History (36) | Drama (18), Documentary (99) | These categories can foreground character choices, real subjects, ideas, or historical context without guaranteeing depth. |
| `romantic` | Romance (10749) | Drama (18) | Romance is a direct movie genre. TMDB has no television Romance genre, so television Drama is documented as a deliberately broad proxy. |
| `spooked` | Horror (27), Thriller (53), Mystery (9648) | Mystery (9648) | Horror, suspense, and uncertainty are proxies; TMDB has no television Horror genre, so television coverage is intentionally limited. |
| `surprised` | No fixed genre | No fixed genre | The `cross-genre-variety` discovery signal preserves breadth so later scoring may favor variety without overriding explicit preferences. |

## Evidence and limitations

The exploratory [discovery interview synthesis](./discovery-interview-synthesis.md) supports offering optional mood or tone input because emotional fit can affect a present viewing decision. It also records that those signals are contextual rather than fixed genre rules and identifies honest mood mapping as an assumption still requiring testing.

These safeguards follow from that evidence:

- mood signals are soft preferences and never hard eligibility rules;
- a genre match may support ranking but does not prove an emotional response;
- a missing mood match must not exclude an otherwise eligible candidate;
- explicit preferred genres remain independent inputs and are not replaced by mood;
- excluded genres, runtime limits, media type, and provider requirements always retain hard-restriction priority;
- `surprised` may encourage bounded variety later but cannot override explicit preferences or restrictions;
- no mapping may claim a guaranteed tone, intensity, suitability, or ending.

## Module and responsibility boundaries

| Module | Responsibility |
| --- | --- |
| `src/shared/recommendation-contracts.ts` | Defines the supported mood values and derived `SupportedMood` type used by request validation. |
| `src/server/mood-mapping.ts` | Owns the versioned mapping, typed genre and discovery signals, explanations, and safe lookup functions. |
| `src/server/mood-mapping.test.ts` | Verifies the exact configuration, every supported mood, every explanation, and unsupported input. |

The mapping module performs no network request, candidate filtering, scoring, final selection, or explanation rendering. It is not imported by browser components or `tmdb-discovery-requests.ts`, and Issue #15 does not convert mood signals into TMDB query parameters.

`getMoodMapping` accepts an unknown runtime value and returns either the configured mapping or `null`. This behavior gives later server-side recommendation logic an explicit unsupported-input outcome without inventing a fallback mood.

## Change control

Any change to supported moods, genre IDs, media applicability, or discovery-signal meaning must update the typed configuration, this document, and the exact-signal tests together. A semantic mapping change must also receive a new version identifier so behavior can be reviewed against the evidence available at that time.

Potential future evidence includes structured prototype feedback, observed replacement reasons such as `wrong mood`, and research that can distinguish emotional tone from broad genre metadata. Evidence should narrow or revise a proxy rather than turn it into an unsupported guarantee.

## Deferred work

Issue #15 defines signals only. The following remain deferred:

- scoring weights and mood-match contributions;
- combining mood with explicit genres and other soft preferences;
- deterministic ranking and tie-breaking;
- final recommendation selection and limited-results behavior;
- structured scoring details and user-facing fit explanations;
- HTTP product-route wiring and browser controls or cards;
- analytics, personalization, and feedback-driven adaptation.

Issue #16 owns deterministic filtering and scoring. Later recommendation-engine and card issues own expanded tests, selection behavior, and user-facing explanations.

## Verification and references

The mood-mapping tests use fixed local configuration and make no live TMDB requests. They generate a distinct test for each supported mood and also verify unsupported values.

TMDB reference material:

- [official movie genres](https://developer.themoviedb.org/reference/genre-movie-list);
- [official television genres](https://developer.themoviedb.org/reference/genre-tv-list);
- [movie discovery parameters](https://developer.themoviedb.org/reference/discover-movie);
- [television discovery parameters](https://developer.themoviedb.org/reference/discover-tv).
