# Recommendation cards

This document records the first browser presentation contract implemented for
[Issue #18](https://github.com/zkzzk34/pick-tonight/issues/18). The card layer
shows exactly three recommendations when it receives a complete
`RecommendationCardSet`. It does not fetch, rank, enrich, or generate
recommendations.

## Display contract

Each `RecommendationCardData` value can provide:

- a stable media key;
- title, year, and movie or television type;
- an overview;
- a complete absolute HTTPS poster URL;
- supported genre names;
- movie runtime or television episode-length context;
- rating value, vote count, and confidence tier;
- freshness copy with an explicit date or current-title basis;
- regional provider names with an explicit JustWatch source;
- a complete absolute HTTPS trailer URL;
- fit copy identified as structured recommendation evidence.

The renderer shows only values present in that contract. Missing or unusable
values receive explicit unavailable states. It does not infer metadata from a
title, construct URLs, guess providers, or turn missing evidence into a
negative claim.

Poster and trailer display URLs must be absolute HTTPS URLs. Raw TMDB
`posterPath` values are not accepted as browser-ready URLs. TMDB documents that
a usable image URL requires a base URL, file size, and file path; assembling
that URL remains part of later server-side enrichment.

Provider data is shown only when it includes a watch region and at least one
nonblank provider name. Its source is fixed to `justwatch`, and the card renders
a branded JustWatch link beside the availability data. The application-level
Credits section provides the fuller source explanation. Provider retrieval,
title-specific outbound URLs, and category handling remain outside this
component.

## Rating uncertainty

The presentation contract uses the same five confidence tiers as the
recommendation engine:

| Tier | Card treatment |
| --- | --- |
| `none` | States that the rating is not established and hides the numeric value |
| `low` | Shows the value with a limited-sample label |
| `medium` | Shows the value with a moderate-sample label |
| `established` | Shows the value with an established-sample label |
| `high` | Shows the value with a high-volume label |

Ratings remain supporting context. They are not presented as a guarantee of
quality, enjoyment, or personal fit.

## Interaction boundary

The card exposes distinct native controls for:

- **Choose tonight**
- **Details**
- **Save**
- **Replace**
- **More like this**
- **Not tonight**
- **Not my taste**
- **Already watched**

The additional feedback actions use a button-controlled disclosure with
`aria-expanded` and `aria-controls`. The component reports actions to its
caller; it does not invent persistence, analytics, title-detail, watchlist, or
feedback semantics.

Replacement is controlled by the caller. `replaceRecommendationAt` creates a
new three-item tuple, changes only the requested position, and leaves the other
objects in place. When a media key changes, focus moves to the newly rendered
article and the prototype caller announces the change through a polite status
region.

## Request-state integration

`RecommendationCards` remains unaware of the request lifecycle.
`RecommendationRequestPanel` renders the deck only while its view state is
`complete`; loading, empty, and error states remain outside the card renderer.
The panel passes the current complete set and a guarded updater to its child,
which lets the preview preserve the existing immutable single-card replacement
behavior.

The application injects a local requester that replays the fixed sample. Neither
the request panel nor the cards perform networking. See the
[recommendation request-state contract](./recommendation-request-states.md) for
the lifecycle, retry, failure-copy, and accessibility boundaries.

## Accessibility and responsive behavior

The deck uses a named section, an ordered list, individually named articles,
heading hierarchy, description lists for facts, native buttons and links,
poster alternative text, and an accessible poster placeholder. All interactive
controls have visible focus styling and a minimum height of 44 CSS pixels.

The layout uses three columns on wide screens, two columns below 64rem, and one
column below 44rem. Facts and action groups also collapse to one column below
28rem so content can reflow at narrow widths without losing functionality.

Automated browser tests verify:

- exactly three ordered cards;
- complete supported evidence and honest missing-data states;
- a branded JustWatch link beside populated provider availability;
- poster-load failure behavior;
- rating-confidence treatment;
- distinct actions and disclosure state;
- immutable single-card replacement;
- focus transfer to the replacement while sibling cards remain mounted;
- the clearly labeled non-live application preview and its status messages.

## Deferred integration

The application preview uses explicitly labeled sample titles and values. It
does not claim that they are live recommendations.

HTTP recommendation routing, title-detail enrichment, TMDB image URL assembly,
provider retrieval, trailer normalization, deterministic explanation
generation, durable action semantics, watchlist persistence, analytics, and
personalization remain owned by their later issues. No TMDB credential or
direct TMDB request is added to browser code.
