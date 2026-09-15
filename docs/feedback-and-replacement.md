# Feedback and Individual Replacement

Issue #29 defines the active-session feedback and one-card replacement behavior
for the browser prototype.

## Scope

The implementation follows the approved product decisions:

- deterministic local replacement pool for the non-live prototype;
- one unsuitable card is replaced without restarting the recommendation request;
- other suitable cards and the reviewed structured preferences stay in place;
- all previously shown titles remain excluded from later replacements;
- exclusion actions replace the affected slot immediately;
- structured feedback is optional and appears after the correction;
- optional free-form feedback is limited to 200 characters and remains in React
  memory only;
- personalization uses an explicit integration seam but creates no persistent
  taste profile in Issue #29;
- Save uses the shared Issue #30 watchlist and remains distinct from feedback;
- no eligible replacement produces an explicit insufficient-result slot rather
  than repeating a title or relaxing a required restriction.

## Action semantics

### Choose tonight

Records current watch intent for the active decision. It does not mark the title
as watched.

### Save

Remains distinct from all feedback actions. Issue #30 connects Save to the shared browser-local watchlist used by recommendation cards, title details, and the Saved view.

The first Save prepends one minimal title record. Repeated saves are idempotent, do not reorder the title, and do not repeat the session or personalization signal.

When personalization is enabled through the integration seam, the first Save may emit a weak taste signal. It is not treated as proof that the title was watched or liked. With personalization disabled, no lasting taste signal is created.

### More like this

Adds a positive signal to the active decision while keeping the title in place.

When personalization is disabled, the action remains useful for the session and
does not create a lasting taste signal.

### Not tonight

Removes the title from the active session and requests a replacement. It never
creates a lasting negative taste signal.

### Not my taste

Removes the title from the active session and requests a replacement.

It can emit a negative taste signal only through the enabled personalization
seam. With personalization disabled, nothing persists.

### Already watched

Removes the title and requests a replacement without treating the title as
disliked.

When personalization is enabled, the seam may receive an `already-watched`
signal distinct from negative taste.

### Replace

Requests another unseen title under the same current preferences. It makes no
taste inference.

## Replacement pool and exclusions

The current browser experience remains a non-live fixture preview.

The deterministic replacement pool exists only so the UX can prove:

- one-card replacement;
- stable untouched cards;
- session-wide exclusion of every title already shown;
- repeated replacement without duplicates; and
- honest replacement exhaustion.

No browser request is added to TMDB.

A later same-origin recommendation route can use the same session-exclusion
semantics with real candidates.

## Structured feedback

Supported structured reasons are:

- Too long
- Unavailable
- Wrong mood
- Disliked genre
- Rating or content concern
- Not interested

A viewer may instead choose `Something else` and enter up to 200 characters.

Feedback is optional. Replacement is never blocked on answering the question.

Free-form reason text is not written to localStorage, sessionStorage, analytics,
or the future taste profile.

## Personalization boundary

Issue #29 introduces a typed personalization seam only.

The application default remains personalization disabled.

When disabled:

- feedback and replacement continue to work;
- More like this remains an active-session positive action;
- Not my taste remains an active-session negative action;
- no lasting taste recorder is called.

When enabled by a future owner, the seam distinguishes:

- positive;
- negative;
- weak Save; and
- already-watched

signals.

Actual local taste-profile persistence, enable/disable controls, migration,
reset, and ranking integration remain owned by Issue #50.

## Watchlist boundary

Issue #30 provides:

- versioned watchlist storage;
- the dedicated Saved view;
- shared Saved state across cards and title details;
- individual removal;
- confirmed watchlist clearing;
- malformed, unavailable, legacy, and future-version storage handling; and
- scoped complete-reset integration.

The watchlist stores only minimal normalized title references. It does not persist free-form feedback, title overviews, recommendation explanations, active preferences, or unnecessary timestamps.

Optional taste-profile persistence, controls, migration, and ranking integration remain owned by Issue #50.

## Exhaustion

If no unseen eligible replacement exists, the affected position becomes an
explicit `No eligible replacement` state.

The interface offers `Edit required restrictions`.

PickTonight does not:

- repeat a title already shown in the active session;
- silently loosen a required restriction; or
- invent a replacement.

## Privacy and storage

The Issue #29 feedback modules add no persistent storage. Issue #30 adds only the separate versioned watchlist record described above.

Active-session feedback may include structured and optional free-form reasons,
but free-form text remains browser-memory-only.

The existing analytics consent storage is unrelated and unchanged.

## Network and secret boundary

Issue #29 adds:

- no product HTTP route;
- no direct browser TMDB request;
- no browser TMDB credential; and
- no analytics event implementation.

The established server-only TMDB boundary remains unchanged.
