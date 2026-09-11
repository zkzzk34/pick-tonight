# Recommendation heuristic v1

## Status and purpose

`recommendation-v1` is PickTonight's initial, reviewable recommendation heuristic. It combines the seven supported mood mappings with deterministic server-side hard filtering, soft scoring, reranking, and selection.

The configuration is an explicit product hypothesis, not a validated emotional-classification model. TMDB genres describe catalog categories; they do not guarantee tone, intensity, humor, romance, fear, or an ending. PickTonight must not present these mappings as promises about how a title will make someone feel.

The typed sources are `src/server/mood-mapping.ts` and `src/server/recommendation-engine.ts`. Supported mood values remain defined by `SUPPORTED_MOODS` in `src/shared/recommendation-contracts.ts`. Mood mappings, scoring evidence, and selection results share the `recommendation-v1` version identifier.

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
| `surprised` | No fixed genre | No fixed genre | The `cross-genre-variety` discovery signal preserves breadth so selection may favor variety without overriding explicit preferences. |

## Evidence and limitations

The exploratory [discovery interview synthesis](./discovery-interview-synthesis.md) supports offering optional mood or tone input because emotional fit can affect a present viewing decision. It also records that those signals are contextual rather than fixed genre rules and identifies honest mood mapping as an assumption still requiring testing.

These safeguards follow from that evidence:

- mood signals are soft preferences and never hard eligibility rules;
- a genre match may support ranking but does not prove an emotional response;
- a missing mood match must not exclude an otherwise eligible candidate;
- explicit preferred genres remain independent inputs and are not replaced by mood;
- excluded genres, runtime limits, media type, and provider requirements always retain hard-restriction priority;
- `surprised` encourages bounded variety during selection but cannot override explicit preferences or restrictions;
- no mapping may claim a guaranteed tone, intensity, suitability, or ending.

## Hard filtering contract

Hard restrictions and active-session exclusions are applied before any candidate receives a soft score. The engine independently checks eligibility even though candidate aggregation already removes many ineligible results.

The v1 engine enforces:

- an exact requested movie or television type, while `either` accepts both;
- rejection of candidates explicitly marked as adult;
- rejection when any candidate genre appears in `excludedGenreIds`;
- exact request-bound evidence for `maximumRuntimeMinutes`;
- exact request-bound provider evidence containing the requested `watchRegion` and provider-ID set;
- exclusion of identities already shown or explicitly removed in the active session.

Runtime and provider restrictions fail closed. If the request requires one and the candidate lacks matching evidence, that candidate never enters the scored pool.

`TmdbDiscoveryCandidate.hardRestrictionEvidence` records that the identity appeared in a discovery source whose request applied the exact runtime or regional-provider constraint. It is query provenance, not a claim that PickTonight retained raw per-title runtime or provider records.

No additional mandatory preference exists in the current request contract. Adding one requires verifiable candidate evidence and an engine-level check before scoring.

## Fixed soft-scoring weights

Only eligible candidates are scored. Every contribution is retained in the structured `RecommendationScoreBreakdown`.

| Signal | Deterministic v1 contribution |
| --- | ---: |
| Explicit preferred genre | `+30` per unique match, capped at `60` |
| Mood genre | `+18` for the first unique match, then `+4` per additional match, capped at `26` |
| Requested content language | `+12` for an exact match |
| Rating | `round(voteAverage x 2 x confidenceFactor)`, capped at `20` |
| Release year | `0`; retained only as selection context |
| Popularity and discovery source | `0`; deliberately ignored |

The `surprised` mood's `cross-genre-variety` signal adds zero points. It is a bounded set-selection instruction, so it cannot inflate relevance or override hard restrictions.

Rating value and confidence remain separate evidence:

| Vote count | Confidence tier | Factor |
| ---: | --- | ---: |
| Missing or `0` | `none` | `0` |
| `1-24` | `low` | `0.25` |
| `25-99` | `medium` | `0.5` |
| `100-499` | `established` | `0.75` |
| `500+` | `high` | `1` |

A small vote count reduces how much positive rating evidence contributes; it never creates a negative quality penalty. A missing rating value contributes zero even when a vote count is present.

Release date creates neither a recency reward nor an age penalty. A valid date contributes its year as zero-point context for temporal cohesion during selection. Missing dates remain neutral. Older titles, including titles from the 1980s and 1990s, therefore compete on fit rather than age.

`originCountry` shapes supported TMDB discovery requests but is not scored because normalized `MediaSummary` objects contain no origin-country field. The engine makes no unsupported per-title origin claim.

Popularity values and supplemental-source labels do not affect scores. V1 has no historical-taste input or adjustment, and it does not invent one.

## Deterministic ranking and selection

Shown and removed session identities are excluded by media type and TMDB ID before scoring. Duplicate eligible identities collapse to one candidate.

Base ranking uses total score, combined current-request preference points, preferred-genre points, mood points, content-language points, rating confidence, rating value, movie before television, and finally ascending TMDB ID. V1 has no historical input or adjustment.

For each slot, the engine considers candidates within five points of the score leader, keeps the strongest combined current-request preference evidence, applies temporal cohesion, applies `surprised` variety when requested, and then uses the base ranking to resolve any remaining tie.

The first selected title supplies the release-year anchor. A later title more than 50 years away is deferred only while a comparably fitting non-extreme or unknown-date title remains. Release year never changes score, and older titles remain eligible.

For `surprised`, variety favors the candidate covering the most genres not already represented by earlier selections. It cannot override hard restrictions, the near-fit window, current-request evidence, or temporal cohesion.

The engine returns exactly three recommendations when at least three eligible identities exist. Otherwise it returns every eligible title with an honest `limited` status.

Each result retains its score breakdown, position, temporal evidence, and cross-genre evidence for later explanation code.

## Module and responsibility boundaries

| Module | Responsibility |
| --- | --- |
| `src/shared/recommendation-contracts.ts` | Defines the supported mood values and derived `SupportedMood` type used by request validation. |
| `src/server/mood-mapping.ts` | Owns the versioned mapping, typed genre and discovery signals, explanations, and safe lookup functions. |
| `src/server/mood-mapping.test.ts` | Verifies the exact configuration, every supported mood, every explanation, and unsupported input. |
| `src/server/tmdb-discovery-candidates.ts` | Preserves source attribution and exact request-bound runtime and provider evidence used by engine-level hard filtering. |
| `src/server/recommendation-engine.ts` | Rechecks hard restrictions, scores only eligible candidates, selects up to three, and returns structured evidence. |
| `src/server/recommendation-engine.test.ts` | Covers hard filtering, score calculations, rating uncertainty, and mood evidence. |
| `src/server/recommendation-engine-selection.test.ts` | Covers deterministic ties, session exclusions, temporal cohesion, variety, and limited results. |
| `src/browser/recommendation-card-model.ts` | Defines the display-ready card contract, rating-confidence copy, safe URL and runtime formatting, and immutable three-card replacement. |
| `src/browser/recommendation-cards.tsx` | Renders the semantic three-card deck, honest unavailable states, distinct action seams, and replacement-focus behavior. |

The mapping module performs no network request, candidate filtering, scoring, final selection, or explanation rendering. It is not imported by browser components or `tmdb-discovery-requests.ts`, and Issue #15 does not convert mood signals into TMDB query parameters.

The recommendation engine performs no TMDB request, request planning, browser work, or explanation rendering.

The browser card modules perform no TMDB request and do not import the recommendation engine. They accept display-ready evidence from their caller; poster URL construction, provider retrieval, trailer enrichment, and fit-explanation generation remain server-side integration work.

`getMoodMapping` accepts an unknown runtime value and returns either the configured mapping or `null`. This behavior gives later server-side recommendation logic an explicit unsupported-input outcome without inventing a fallback mood.

## Change control

Any change to supported moods, genre IDs, media applicability, or discovery-signal meaning must update the typed configuration, this document, and the exact-signal tests together. A semantic mapping change must also receive a new version identifier so behavior can be reviewed against the evidence available at that time.

Any change to scoring weights, rating-confidence thresholds, tie-breaking, temporal cohesion, variety, or selection evidence must update the implementation, this document, and focused tests together. A semantic heuristic change must also receive a new version identifier.

Potential future evidence includes structured prototype feedback, observed replacement reasons such as `wrong mood`, and research that can distinguish emotional tone from broad genre metadata. Evidence should narrow or revise a proxy rather than turn it into an unsupported guarantee.

## Deferred work

Issues #15 through #17 established server-side mapping, hard filtering, scoring, deterministic selection, structured evidence, and focused coverage. Issue #18 adds browser presentation without widening the engine or networking responsibilities. The following remain deferred:

- server-side display enrichment, including poster URL construction, provider retrieval, and trailer lookup;
- user-facing fit-explanation generation from retained evidence;
- HTTP product-route wiring unless a separate issue explicitly owns it;
- durable action, replacement, session, and watchlist semantics;
- analytics and browser personalization, including any historical-taste adjustment.

No public request field or historical signal is added by this heuristic. TMDB networking and request planning remain separate from the recommendation engine.

## Verification and references

The mood-mapping, candidate-aggregation, and recommendation-engine tests use fixed local data and make no live TMDB requests. Together they cover supported and unsupported moods, restriction evidence, hard filtering, scoring, rating uncertainty, deterministic ties including the final media-type and TMDB-ID fallbacks, missing metadata, session exclusions, temporal cohesion, surprised variety, complete and limited selection across zero, one, two, and at least three eligible candidates, and enforcement of the three-result maximum.

TMDB reference material:

- [official movie genres](https://developer.themoviedb.org/reference/genre-movie-list);
- [official television genres](https://developer.themoviedb.org/reference/genre-tv-list);
- [movie discovery parameters](https://developer.themoviedb.org/reference/discover-movie);
- [television discovery parameters](https://developer.themoviedb.org/reference/discover-tv).
