# Recommendation heuristic v3

## Status and purpose

`recommendation-v4` is PickTonight's current, reviewable recommendation heuristic. It combines the seven supported mood mappings with deterministic server-side hard filtering, soft scoring, reranking, selection, and evidence-backed explanation generation.

The configuration is an explicit product hypothesis, not a validated emotional-classification model. TMDB genres describe catalog categories; they do not guarantee tone, intensity, humor, romance, fear, or an ending. PickTonight must not present these mappings as promises about how a title will make someone feel.

The typed sources are `src/shared/recommendation-contracts.ts`, `src/server/mood-mapping.ts`, `src/server/recommendation-engine.ts`, and `src/server/recommendation-explanations.ts`. Supported mood values remain defined by `SUPPORTED_MOODS` in `src/shared/recommendation-contracts.ts`. Mood mappings remain versioned as `recommendation-v1` because the Issue #24 diversity pass does not change mood-signal semantics. Scoring and selection evidence use the `recommendation-v4` heuristic identifier.

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

The recommendation engine enforces:

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

| Signal | Deterministic contribution |
| --- | ---: |
| Explicit preferred genre | `+30` per unique match, capped at `60` |
| Mood genre | `+18` for the first unique match, then `+4` per additional match, capped at `26` |
| Requested content language | `+12` for an exact match |
| Rating | `round(voteAverage x 2 x confidenceFactor)`, capped at `20` |
| Explicit freshness match | `+24` when a known release year is at or after the requested soft cutoff; otherwise `0` |
| Popularity and discovery source | `0`; deliberately ignored |

The `surprised` mood's `cross-genre-variety` signal adds zero points. It is a bounded set-selection instruction, so it cannot inflate relevance or override hard restrictions.

### Age-aware rating confidence

The rating-confidence configuration defines a **180-calendar-day recent-title
window** through `RATING_CONFIDENCE_CONFIG.recentTitleWindowDays`.

For movies, age is based on the normalized release date. For television, the
same `MediaSummary.releaseDate` field carries the normalized first-air date.
The engine compares that date with the scoring `asOfDate`.

Age state is recorded as:

- `recent` when a valid release or first-air date is 0 through 180 calendar
  days old, inclusive;
- `established` when a valid date is more than 180 calendar days old;
- `unknown` when the date is missing, unusable, or later than the scoring date.

The optional scoring `asOfDate` exists so age-sensitive behavior can be tested
deterministically. When no value is supplied, the server uses the current UTC
calendar date.

The 180-day window and vote thresholds are explicit product assumptions. They
are **not a statistical confidence interval** and must not be presented as a
claim that one title is objectively better than another.

Rating value, vote count, confidence state, and quality contribution remain
separate evidence. `meaningfulEvidence` is true only when TMDB supplies a
rating average and the vote count is greater than zero.

| Rating evidence | Vote count | Age state | Confidence state | Factor |
| --- | ---: | --- | --- | ---: |
| Missing rating, missing vote count, or zero votes | any | any | `limited` | `0` |
| Meaningful evidence | `1-24` | any | `limited` | `0.25` |
| Meaningful evidence | `25-99` | any | `medium` | `0.5` |
| Meaningful evidence | `100-499` | `recent` | `strong` | `1` |
| Meaningful evidence | `100-499` | `established` or `unknown` | `medium` | `0.75` |
| Meaningful evidence | `500+` | any | `strong` | `1` |

A low vote count is never an automatic rejection rule. An otherwise eligible
recent title with sparse votes remains eligible; its evidence is treated as
limited or medium rather than automatically poor. Confidence changes only how
much positive rating evidence contributes to recommendation scoring.

When meaningful rating evidence is unavailable, rating contribution is zero.
The raw rating average is also excluded from the rating-value ranking
tie-break, so the engine does not turn an unsupported number into an implicit
quality claim.

The confidence adjustment does not rewrite or replace TMDB's displayed rating
average or vote count. `voteAverage` and `voteCount` remain the normalized
upstream values. `ageState`, `meaningfulEvidence`, `confidenceState`,
`confidenceFactor`, and rating `points` are internal recommendation evidence
for later explanation logic.

An explicit freshness preference contributes `+24` when the candidate has a
known release year at or after the requested cutoff. This is deliberately a
strong soft preference: it is stronger than the maximum rating-only
contribution (`20`), slightly below the maximum mood contribution (`26`), and
below one explicit preferred-genre match (`30`).

Candidates before the requested year, or candidates with an unknown date,
receive zero freshness points rather than being excluded. Older titles,
including titles from the 1980s and 1990s, therefore remain eligible and may
still rank ahead of a newer title when their other current-session fit is
substantially stronger.

`originCountry` shapes supported TMDB discovery requests but is not scored because normalized `MediaSummary` objects contain no origin-country field. The engine makes no unsupported per-title origin claim.

Popularity values and supplemental-source labels do not affect scores. The current heuristic has no historical-taste input or adjustment, and it does not invent one.

## Deterministic ranking and selection

Shown and removed session identities are excluded by media type and TMDB ID before scoring. Duplicate eligible identities collapse to one candidate.

Base ranking uses total score, combined current-request preference points, preferred-genre points, mood points, content-language points, rating-confidence factor, meaningful rating value, movie before television, and finally ascending TMDB ID. A raw rating value without meaningful vote evidence is not used as a quality tie-break. The current heuristic has no historical input or adjustment.

For each slot, the engine considers candidates within five points of the score leader, keeps the strongest combined current-request preference evidence including explicit freshness, applies temporal cohesion, applies deterministic genre diversity, applies the stronger `surprised` variety rule when requested, and then uses the base ranking to resolve any remaining tie.

The first selected title supplies the release-year anchor. A later title more than 50 years away is deferred only while a comparably fitting non-extreme or unknown-date title remains. Release year never changes score, and older titles remain eligible.

### General genre diversity

The first selected recommendation always preserves the strongest base-ranked
fit after eligibility, scoring, and the existing deterministic tie-breaks.

For later slots, genre diversity runs only after the existing near-fit,
current-request preference, and temporal-cohesion narrowing. The threshold is
`GENRE_DIVERSITY_MINIMUM_NEW_GENRES = 1`.

The general rule is deliberately conservative:

- if the base-ranked candidate adds at least one genre not represented by
  earlier selections, the base ranking is preserved;
- if the base-ranked candidate adds zero new genres and another candidate in
  the already narrowed pool adds at least one new genre, the first such
  candidate in base-ranking order is selected;
- if the narrowed pool is homogeneous and no candidate adds new genre
  coverage, the base ranking is preserved;
- diversity never restores a candidate removed by a hard restriction, session
  exclusion, near-fit rule, current-request preference rule, or temporal
  cohesion.

This first diversity version uses only normalized TMDB genre IDs already
present on `MediaSummary`. The recommendation candidate boundary contains no
structured collection, franchise, sequel/prequel, or similar-title
relationship evidence. PickTonight therefore does not infer that two titles
are closely related from title text, discovery source, or other unsupported
signals.

`GenreDiversityEvidence` records whether the rule applied, which genre IDs the
selected title newly covers, and whether diversity changed the base-ranked
choice for that slot.

For `surprised`, the existing stronger variety rule then favors the candidate covering the most genres not already represented by earlier selections. It cannot override hard restrictions, the near-fit window, current-request evidence, temporal cohesion, or the general diversity candidate boundary.

The engine returns exactly three recommendations when at least three eligible identities exist. Otherwise it returns every eligible title with an honest `limited` status.

Each result retains its score breakdown, position, temporal evidence, general genre-diversity evidence, surprised cross-genre evidence, and a validated structured explanation generated from the current request and evidence.

## Structured recommendation explanations

`src/server/recommendation-explanations.ts` converts the validated request, `RecommendationScoreBreakdown`, and exact `TmdbHardRestrictionEvidence` into a strict `RecommendationExplanation`. It does not inspect raw upstream responses or free-form user text. Explanation generation does not itself change eligibility, scores, ranking, temporal cohesion, or diversity selection. The current `recommendation-v4` identifier reflects the later explicit-freshness scoring change, not explanation generation.

Each explanation contains one concise summary and zero through two ordered reasons. Every reason includes a stable code, user-facing text, and one of two kinds:

- `verified-constraint` identifies satisfaction backed by exact request-bound hard-restriction evidence;
- `soft-match` identifies a supported current-request match or qualifying rating evidence.

When both kinds are available, the generator selects the highest-priority verified reason and the highest-priority soft reason. Otherwise it fills the two available slots from one kind. Verified priority is provider availability followed by runtime. Soft priority is preferred genre, mood, explicit freshness, requested content language, then rating confidence. Identical request and candidate evidence produces identical output.

| Reason code | Kind | Required structured evidence |
| --- | --- | --- |
| `provider-availability` | Verified constraint | The request supplies `watchRegion` and provider IDs, and the candidate retains query evidence for that exact region and provider-ID set. |
| `runtime-within-limit` | Verified constraint | The request and candidate evidence contain the same maximum-runtime limit. |
| `preferred-genre-match` | Soft match | At least one requested genre appears in the score's matched genre IDs with a positive contribution. |
| `mood-match` | Soft match | The requested mood has matching genre or supported discovery-signal evidence. |
| `freshness-match` | Soft match | The request explicitly supplies `releasedSinceYear` and the candidate's known release year meets that cutoff. |
| `content-language-match` | Soft match | The requested language exactly matches the scored candidate language. |
| `rating-confidence` | Soft match | Rating evidence is meaningful, has at least 100 votes, has a positive contribution, and has `medium` or `strong` confidence. |

If no reason qualifies, the generator returns a neutral summary and an empty reason list. Missing provider evidence never becomes a regional-availability claim, and missing or sparse ratings never become a poor-quality claim. User-facing copy does not expose numerical weights, suggest that more preferences improve accuracy, or claim TikTok virality or other unsupported social popularity.
## Module and responsibility boundaries

| Module | Responsibility |
| --- | --- |
| `src/shared/recommendation-contracts.ts` | Defines strict request and explanation schemas, stable reason-code vocabularies, copy limits, and inferred shared types. |
| `src/server/mood-mapping.ts` | Owns the versioned mapping, typed genre and discovery signals, explanations, and safe lookup functions. |
| `src/server/mood-mapping.test.ts` | Verifies the exact configuration, every supported mood, every explanation, and unsupported input. |
| `src/server/tmdb-discovery-candidates.ts` | Preserves source attribution and exact request-bound runtime and provider evidence used by engine-level hard filtering. |
| `src/server/recommendation-engine.ts` | Rechecks hard restrictions, scores only eligible candidates, selects up to three, and attaches structured scoring, selection, and explanation evidence. |
| `src/server/recommendation-explanations.ts` | Selects supported reasons deterministically and validates every generated explanation against the shared schema. |
| `src/server/recommendation-explanation-contracts.test.ts` | Verifies strict reason kinds, codes, limits, missing-data shape, and unknown-field rejection. |
| `src/server/recommendation-explanations.test.ts` | Verifies supported combinations, evidence gates, deterministic priority, safe copy, and neutral fallbacks. |
| `src/server/recommendation-engine.test.ts` | Covers hard filtering, score calculations, rating uncertainty, and mood evidence. |
| `src/server/recommendation-engine-selection.test.ts` | Covers deterministic ties, session exclusions, temporal cohesion, diversity behavior, stronger-fit preservation, limited results, and explanation attachment. |
| `src/browser/recommendation-card-model.ts` | Defines the display-ready card contract, rating-confidence copy, safe URL and runtime formatting, and immutable three-card replacement. |
| `src/browser/recommendation-cards.tsx` | Renders the semantic three-card deck, honest unavailable states, distinct action seams, and replacement-focus behavior. |
| `src/browser/recommendation-request-state.ts` | Defines browser lifecycle and result types, fixed safe failure copy, detached request snapshots, and the injected requester contract. |
| `src/browser/recommendation-request-panel.tsx` | Coordinates guarded submission, live status and error presentation, same-preference retry, and complete-set rendering. |

The mapping module performs no network request, candidate filtering, scoring, final selection, or explanation rendering. It is not imported by browser components or `tmdb-discovery-requests.ts`, and Issue #15 does not convert mood signals into TMDB query parameters.

The recommendation engine performs no TMDB request, request planning, browser work, or UI rendering. Explanation generation remains deterministic server logic and does not alter selection.

The browser card modules perform no TMDB request and do not import the recommendation engine. They accept display-ready evidence from their caller; composing server-side title enrichment and mapping structured explanations into browser-ready card data remain later integration work.

The browser request-state modules import shared request types and browser card
types, not the server recommendation engine. They render cards only while the
browser view state is complete and accept an injected requester rather than
creating a transport dependency. The current application requester replays fixed
local sample data; HTTP route wiring and limited one- or two-result presentation
remain deferred.

`getMoodMapping` accepts an unknown runtime value and returns either the configured mapping or `null`. This behavior gives later server-side recommendation logic an explicit unsupported-input outcome without inventing a fallback mood.

## Change control

Any change to supported moods, genre IDs, media applicability, or discovery-signal meaning must update the typed configuration, this document, and the exact-signal tests together. A semantic mapping change must also receive a new version identifier so behavior can be reviewed against the evidence available at that time.

Any change to scoring weights, rating-confidence thresholds, tie-breaking, temporal cohesion, variety, or selection evidence must update the implementation, this document, and focused tests together. A semantic heuristic change must also receive a new version identifier.

Any change to reason codes, reason kinds, priority, evidence gates, copy limits, or neutral fallback behavior must update the shared schema, generator, this document, and focused tests together. An explanation-only change does not require a new heuristic version unless it also changes scoring or selection semantics.

Potential future evidence includes structured prototype feedback, observed replacement reasons such as `wrong mood`, and research that can distinguish emotional tone from broad genre metadata. Evidence should narrow or revise a proxy rather than turn it into an unsupported guarantee.

## Deferred work

Issues #15 through #17 established server-side mapping, hard filtering, scoring, deterministic selection, structured evidence, and focused coverage. Issues #18 and #19 added isolated browser presentation and request-state seams. Issues #21 and #22 added server-side reference caching and title enrichment, Issue #24 added deterministic diversity, and Issue #25 adds structured fit explanations. The following remain deferred:

- composing server-side title enrichment into browser-ready recommendation results;
- mapping structured server-generated explanations into browser card presentation;
- HTTP product-route wiring unless a separate issue explicitly owns it;
- durable action, replacement, session, and watchlist semantics;
- analytics and browser personalization, including any historical-taste adjustment.

The request contract adds only the optional explicit `softPreferences.freshness.releasedSinceYear` cutoff; omitting it creates no recency preference. No historical signal is added. TMDB networking and request planning remain separate from the recommendation engine.

## Verification and references

The mood-mapping, candidate-aggregation, and recommendation-engine tests use fixed local data and make no live TMDB requests. Together they cover supported and unsupported moods, restriction evidence, hard filtering, scoring, rating uncertainty, zero- and low-vote evidence, recent and established confidence behavior, deterministic ties including the final media-type and TMDB-ID fallbacks, missing metadata, session exclusions, temporal cohesion, homogeneous and varied genre-diversity pools, stronger-fit preservation, surprised variety, complete and limited selection across zero, one, two, and at least three eligible candidates, and enforcement of the three-result maximum.

Explanation contract and generator tests use fixed local evidence and make no live request. They cover verified runtime and provider reasons, preferred genre, mood, explicit freshness, language, qualifying rating confidence, mixed-kind priority, the two-reason cap, deterministic output, neutral missing-data fallbacks, and prohibited unsupported copy.

Browser request-state tests use injected requesters and fixed local data to
cover loading, duplicate protection, empty results, safe failure categories,
unsafe-error non-reflection, and detached retry snapshots. They perform no live
TMDB or HTTP request.

TMDB reference material:

- [official movie genres](https://developer.themoviedb.org/reference/genre-movie-list);
- [official television genres](https://developer.themoviedb.org/reference/genre-tv-list);
- [movie discovery parameters](https://developer.themoviedb.org/reference/discover-movie);
- [television discovery parameters](https://developer.themoviedb.org/reference/discover-tv).
