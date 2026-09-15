# Local Watchlist

- **Status:** Implemented
- **Owner:** ZK Zhao
- **Date:** September 15, 2026
- **Related issue:** [#30 — Implement the local watchlist](https://github.com/zkzzk34/pick-tonight/issues/30)
- **Requirements:** [Product Requirements and Research Boundaries](./product-requirements.md)
- **Privacy:** [Privacy, Local Data, and Optional Analytics](./privacy-and-local-data.md)

## Purpose

Issue #30 adds a browser-local watchlist without introducing an account, application database, cross-device synchronization, direct browser TMDB request, or persistent taste profile.

The watchlist is separate from the active recommendation session, optional personalization, and optional analytics consent.

## User experience

- `Save` is available from recommendation cards and title details.
- A newly saved title appears first in `Saved (count)`.
- Card, detail, and Saved surfaces share one source of Saved state.
- Repeating Save is idempotent and does not reorder the title.
- `Remove` acts immediately and does not imply dislike.
- Removing a title returns its card and detail action to the unsaved state.
- The Choose subtree remains mounted while Saved is open, so navigation and removal do not discard the active decision.
- Saved cards intentionally omit title details until a resolver can restore the complete evidence contract.

## Storage contract

The browser-storage key is `picktonight.watchlist`. The current schema version is `1`.

```json
{
  "version": 1,
  "items": [
    {
      "mediaKey": "movie:101",
      "mediaType": "movie",
      "title": "Example title",
      "year": 2001,
      "posterUrl": null
    }
  ]
}
```

Each item contains exactly:

- `mediaKey`: stable movie or television identity;
- `mediaType`: `movie` or `tv`;
- `title`: display title;
- `year`: release or first-air year when known, otherwise `null`; and
- `posterUrl`: usable poster reference when known, otherwise `null`.

Array order is the user-visible order. New titles are prepended, so the newest save appears first. No timestamp is required.

## Read, migration, and recovery behavior

A read validates every stored field before it reaches React state.

- A valid version-one record is normalized.
- Recognized version-zero data is migrated without inventing unavailable metadata.
- Valid entries can be salvaged from a partially invalid record.
- Duplicate media keys are removed while preserving the first valid occurrence.
- Extra properties are stripped.
- Missing or explicitly removed storage produces an empty watchlist.
- Malformed JSON produces an empty watchlist without automatic deletion.
- An unknown future version produces an empty watchlist and is not overwritten automatically.
- Storage access failures produce a safe session-only fallback.

A later successful user mutation writes the current version-one representation when writing is permitted.

## Session-only fallback

Browser policy, private browsing behavior, storage restrictions, or runtime failures can make persistent storage unavailable. Save, Saved, and Remove continue in React memory for the current page session.

The interface must state that these session-only titles may disappear when the page closes. It must not claim successful persistence.

## Action and personalization boundary

Save is a distinct user intent: the viewer wants to revisit the title. It is not proof that the title was watched or liked.

When optional personalization is disabled, Save writes no lasting taste signal. When an enabled personalization integration is supplied, only the first successful Save may emit the existing weak Save signal. Duplicate Save and Remove do not emit additional taste signals.

Issue #30 does not implement the persistent taste profile owned by Issue #50.

## Removal and clearing

Individual Remove is immediate. After removal, focus moves to the next Remove control, the previous Remove control, or `Find something to watch` when the list becomes empty.

`Clear watchlist` requires confirmation. Cancel receives initial focus. Escape and Cancel return focus to the invoking button. A confirmed clear moves focus to the status message and leaves analytics consent and the active Choose decision unchanged.

## Complete local-data reset

`Reset all PickTonight data` removes only explicitly registered PickTonight keys and clears the active session before returning to Choose.

The current reset includes:

- the watchlist key;
- the analytics-consent key; and
- active in-memory decision state.

The implementation does not call `localStorage.clear()` and therefore does not broadly erase unrelated origin data. Future PickTonight storage keys must be explicitly registered with the reset behavior. If a scoped removal fails, current-session state is still reset, but the interface reports that browser storage was not fully updated and that persisted data may return after reload.

## Data excluded from the watchlist

The watchlist does not store:

- raw preference text;
- free-form feedback;
- structured rejection reasons;
- title overviews;
- recommendation explanations;
- provider details;
- active-session preferences;
- analytics identifiers;
- credentials or secrets; or
- unnecessary timestamps.

## Verification

Automated coverage lives in:

- `src/browser/watchlist-storage.test.ts` for schema, migration, recovery, ordering, idempotency, and unavailable storage;
- `src/browser/saved-watchlist-integration.test.tsx` for restoration, shared state, removal, and active-session preservation;
- `src/browser/saved-titles.test.tsx` for honest session-only messaging;
- `src/browser/recommendation-preview.test.tsx` for Save integration; and
- `src/browser/local-data-reset.test.tsx` for scoped resets, confirmation, and focus behavior.

## External platform references

- [Window: `localStorage` — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [`<dialog>` — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [Dialog (Modal) Pattern — WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
