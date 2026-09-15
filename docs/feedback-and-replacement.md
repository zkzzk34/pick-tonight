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
- Save remains a distinct action but persistent watchlist behavior belongs to
  Issue #30;
- no eligible replacement produces an explicit insufficient-result slot rather
  than repeating a title or relaxing a required restriction.

## Action semantics

### Choose tonight

Records current watch intent for the active decision. It does not mark the title
as watched.

### Save

Remains distinct from all feedback actions. Issue #29 does not fake watchlist
persistence. Issue #30 owns the local watchlist.

When personalization is enabled through the integration seam, Save may emit a
weak taste signal. It is not treated as proof that the title was watched or
liked.

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

Issue #29 does not create persistent saved-title state.

Issue #30 owns:

- versioned watchlist storage;
- Saved view;
- removal;
- watchlist clear;
- corrupted-storage handling; and
- complete-reset integration.

## Exhaustion

If no unseen eligible replacement exists, the affected position becomes an
explicit `No eligible replacement` state.

The interface offers `Edit required restrictions`.

PickTonight does not:

- repeat a title already shown in the active session;
- silently loosen a required restriction; or
- invent a replacement.

## Privacy and storage

The Issue #29 feedback modules add no persistent storage.

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
