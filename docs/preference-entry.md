# Preference Entry and Interpretation

Issue #27 implements the first deterministic browser preference-entry and
review flow for PickTonight.

## Scope

The browser supports:

- optional free-form words;
- media-type, mood, genre, and available-time quick controls;
- progressively disclosed companion, freshness, language, origin, watch-region,
  provider, and exclusion controls;
- a deterministic interpretation checkpoint before recommendations are
  requested;
- explicit separation of required restrictions from soft preferences;
- honest unsupported-text handling;
- Broad, Focused, and Very specific selectivity labels;
- a reviewed `RecommendationRequest` passed to the existing injected request
  controller.

The requester still returns the fixed local recommendation sample. Issue #27
does not add the product HTTP route, live TMDB calls from the browser, analytics
events, personalization, watchlist persistence, or title-detail behavior.

## Raw text boundary

Raw free-form text exists only in React state for the active browser decision.

It is not written to:

- `localStorage`;
- `sessionStorage`;
- analytics;
- the normalized `RecommendationRequest`.

Only reviewed structured fields are passed to the request controller.

## Interpretation precedence

Interpretation is deterministic.

1. Supported text is mapped through the documented rules below.
2. Explicit controls override conflicting text.
3. The review screen explains conflicts rather than silently hiding them.
4. Unsupported or ambiguous words remain visible under
   **We weren't sure about**.
5. The viewer may remove an interpreted item, edit the original request, add a
   guided preference, or explicitly ignore unsupported words.

## Supported text vocabulary

The first parser intentionally recognizes a small reviewed vocabulary.

### Media

- `movie`, `film` → movie
- `tv`, `television`, `show`, `series` → television
- text containing both movie and television terms → either

### Mood

- `funny`, `hilarious`, `make me laugh`, `laughing` → Make me laugh
- `relaxed`, `relaxing`, `chill`, `easygoing` → Relaxed
- `excited`, `exciting`, `high energy` → Excited
- `thoughtful`, `reflective`, `cerebral` → Thoughtful
- `romantic` → Romantic
- `spooky`, `spooked`, `scary` → Spooked
- `surprise me`, `surprising` → Surprise me

### Time

Supported numeric minute expressions and one/two-hour expressions become the
hard `maximumRuntimeMinutes` restriction.

Examples:

- `under 90 minutes`
- `90 min`
- `under two hours`
- `2 hours`

### Freshness

Only an explicit supported year is interpreted:

- `since 2023`
- `released since 2023`

The parser does not assign an arbitrary cutoff to words such as `recent`.
The guided control exposes an exact **Released since year** input.

### Language and origin

Language and origin remain separate.

Explicit language phrases include forms such as:

- `in Korean`
- `Japanese language`
- `in Spanish`

Standalone supported nationality adjectives are interpreted as origin-country
preferences, for example `Korean movie` → origin `KR`.

### Companions

Supported active-session companion phrases include:

- `with friends`
- `with my partner`
- `date night`
- `with family`
- `alone`
- `by myself`

Companion context is displayed in review but is not sent to the current
recommendation API because the current shared request contract does not yet
contain a supported companion-fit field.

### Genres

Genres are media-aware.

Movie and TV genre IDs are not assumed to be interchangeable. When media type
is `Either`, the UI and parser expose only concepts whose TMDB IDs map cleanly
across both media types.

Genre exclusions are recognized through forms such as:

- `no horror`
- `avoid horror`
- `without comedy`

## Guided provider shortlist

Issue #27 does not add a browser provider-catalog endpoint.

The guided provider controls therefore use a limited US-only shortlist:

| Provider | TMDB provider ID |
|---|---:|
| Netflix | 8 |
| Prime Video | 9 |
| Disney+ | 337 |
| Hulu | 15 |
| Max | 1899 |
| Apple TV+ | 350 |

Changing watch region away from `US` clears and disables this static provider
shortlist. Provider availability remains regional and may change.

Selecting multiple services preserves the current request contract's
any-provider behavior.

## Selectivity

Selectivity is not an accuracy score.

Weights:

| Reviewed signal | Points |
|---|---:|
| Explicit movie or television | 1 |
| Each excluded genre | 1 |
| Maximum available time | 2 |
| One or more required providers | 2 |
| Each preferred genre | 1 |
| Mood | 1 |
| Freshness | 1 |
| Content language | 1 |
| Origin country | 1 |
| Companion context | 0.5 |
| Watch region | 0 |

Thresholds:

- **Broad:** less than 2
- **Focused:** 2 through 4
- **Very specific:** greater than 4

The label communicates how much the request may narrow the candidate set. It
does not promise that a more specific request is more accurate.
