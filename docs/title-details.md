# Title Details

Issue #28 adds the browser title-details decision surface.

## Scope

The implementation is intentionally browser-only and fixture-driven. It does
not add a product title-details HTTP route and does not make direct browser
requests to TMDB.

The detail surface receives a dedicated display-ready `TitleDetailData`
contract. That contract is separate from server-only TMDB normalization types
so future same-origin API integration can map normalized enrichment into the
browser without importing server modules.

## Navigation and session preservation

Details replace the visible recommendation cards in the existing single-page
flow.

The recommendation set remains mounted while details are open. Returning:

- restores the same three recommendation objects and order;
- preserves prior replacements;
- preserves the reviewed structured request;
- preserves active-session raw preference text and companion context;
- preserves session-only action status; and
- restores keyboard focus to the Details control that opened the title.

No recommendation request is re-run simply because the viewer returns from
details.

## Supported evidence

The detail view can show:

- poster or an accessible placeholder;
- title, year, and movie/television identity;
- overview;
- genres;
- movie runtime or television episode-length context;
- rating value, vote count, and rating-confidence context;
- supported freshness information;
- region-specific provider categories;
- external trailer links;
- structured recommendation summary and individual reasons.

Missing information remains explicit. Unknown provider data is described as
unknown rather than as proof that a title is unavailable.

## Providers

Provider information remains regional and JustWatch-attributed.

The browser detail contract keeps the supported categories separate:

- streaming;
- free;
- with ads;
- rent; and
- buy.

When a supported TMDB destination URL exists, the detail surface may expose it
as an external availability link.

## Explanation

Title details show the structured recommendation explanation as:

1. a concise summary; and
2. individual reasons labeled as verified restrictions, preference matches, or
   neutral context.

No internal scoring weights are exposed.

## Actions

The title-detail surface exposes seven distinct actions:

- `Choose tonight`
- `Save`
- `More like this`
- `Not tonight`
- `Not my taste`
- `Already watched`
- `Replace`

Issue #28 gives those controls distinct session-visible action semantics without
absorbing later issues.

`Choose tonight` records active-session watch intent only. It is not proof that
the title was completed or watched.

Issue #28 originally left `Save` session-visible only. Issue #30 now routes
`Save` through the shared local watchlist. Saved state stays synchronized with
recommendation cards and the Saved view, and repeated saves are idempotent.

Issue #29 supplies feedback-driven recommendation and exclusion semantics.
Issue #30 adds watchlist persistence without collapsing Save into feedback.

The existing local Replace demonstration continues replacing only the selected
card while keeping the other recommendations and active preferences stable.

## Trailer behavior

Supported trailers open externally in a new tab so leaving for a trailer does
not intentionally discard the in-memory PickTonight decision state.

PickTonight does not embed or host trailer video in Issue #28.

## Network and secret boundary

Issue #28 adds:

- no `fetch` call to the browser title-details modules;
- no direct TMDB API hostname;
- no TMDB credential; and
- no product HTTP route.

The established server-only TMDB boundary remains unchanged.
