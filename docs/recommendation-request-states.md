# Recommendation request states

This document records the browser request-lifecycle contract implemented for
[Issue #19](https://github.com/zkzzk34/pick-tonight/issues/19).
`RecommendationRequestPanel` sits between submitted preferences and the
recommendation-card renderer. It accepts an injected asynchronous requester so
the critical interface states can be exercised without adding browser access to
TMDB or prematurely exposing an HTTP recommendation route.

## Responsibility boundary

The browser request layer owns:

- idle, loading, complete, empty, and error presentation;
- synchronous duplicate-submission protection;
- detached snapshots of submitted preferences;
- same-preference retry behavior;
- fixed user-safe failure copy;
- accessible status, alert, busy, button, focus, and reduced-motion behavior;
- rendering and updating a complete three-card set supplied by its caller.

It does not fetch from TMDB, import server modules, rank or enrich candidates,
classify HTTP responses, create an HTTP product route, persist actions, or expose
technical exception details. Those responsibilities remain outside this browser
component.

## State model

| State | Entry condition | Browser behavior |
| --- | --- | --- |
| `idle` | The panel mounts without initial recommendations | Prompts the viewer to submit preferences |
| `loading` | A new submission or retry is accepted | Announces progress, marks only the results group busy, disables submission, and renders no cards |
| `complete` | The requester returns a complete `RecommendationCardSet` | Renders the exact three-card tuple through the child renderer |
| `empty` | The requester returns `status: "empty"` | Explains that no titles matched every submitted restriction and renders no cards |
| `error` | The requester returns a supported failure or rejects | Shows fixed safe copy and, after a submitted request exists, a same-preference retry action |

Supplying `initialRecommendations` initializes the panel in `complete` rather
than `idle`. The application preview uses this path so the sample cards remain
visible before the request control is exercised.

The current browser success boundary remains deliberately narrow:
`RecommendationCardSet` is an exact three-item tuple. Zero eligible results use
the explicit `empty` state. Browser presentation for honestly limited one- or
two-result engine responses remains deferred until a later integration defines
that display contract.

## Submission and retry invariants

A request follows these rules:

1. The form prevents native navigation and checks an in-flight ref.
2. The ref is set synchronously before the asynchronous requester is called.
3. The submit button is disabled and relabeled while loading.
4. The submitted preferences are copied with `structuredClone` and retained as
   the last submitted snapshot.
5. The requester receives a separate clone, so neither caller mutation nor
   requester mutation can alter the retained retry value.
6. The in-flight ref is released in `finally` after success or failure.

The synchronous ref closes the gap before React renders the disabled button, so
two submissions in the same event window still start only one request. Both the
submit and retry handlers enforce the same guard.

Retry uses the detached snapshot from the last accepted submission. Editing the
current preference object after that submission does not change the retry.
Submitting again intentionally replaces the stored snapshot with the newly
submitted preferences.

Resolved state is not written after unmount. While complete results are shown,
the child renderer receives an updater that changes recommendations only when
the panel is still in `complete`; the preview uses it for immutable single-card
replacement.

## Failure categories and safe copy

| Failure | Title | Message |
| --- | --- | --- |
| `validation` | Check your preferences | Some submitted preferences could not be used. Review them and try again. |
| `authentication` | Recommendations are temporarily unavailable | PickTonight cannot securely access recommendation data right now. Try again later. |
| `timeout` | The request took too long | PickTonight could not finish in time. Try the same preferences again. |
| `upstream` | Recommendations are temporarily unavailable | PickTonight could not finish this request. Try again shortly. |

A future transport adapter may map validated server or upstream outcomes into
these categories. The current local preview requester returns only `complete`.
If any injected requester throws, the panel ignores the caught value and uses
the fixed `upstream` copy. Stack traces, credentials, upstream bodies, request
details, and exception messages are never rendered.

## Accessibility and responsive behavior

The request controls use a native form and button. The named `role="status"`
container is present from the initial render, uses `aria-atomic="true"`, and
receives idle, loading, or empty copy. The named `role="alert"` container is
also persistent and receives failure content. Empty live-region containers are
visually clipped rather than removed from the accessibility tree.

The persistent named results group carries `aria-busy`. During loading, the
polite status message remains outside that busy subtree, preventing the busy
state from deferring the progress announcement while still describing results
as incomplete.

Request and retry buttons have visible focus treatment and a `2.75rem` minimum
height. They expand to the available width below `44rem`. Loading animation is
removed when the viewer requests reduced motion.

The implementation follows these W3C techniques and definitions:

- [ARIA22: Using `role=status` to present status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22);
- [ARIA19: Using `role=alert` or live regions to identify errors](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19);
- [WAI-ARIA `aria-busy`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy).

## Prototype integration

`App` injects fixed submitted preferences and a local requester that resolves
`INITIAL_PREVIEW_RECOMMENDATIONS`. The interface explicitly says that the
control replays the same local sample and does not call TMDB or another live
recommendation service.

This seam demonstrates the request lifecycle while preserving the browser/server
security boundary. Live HTTP wiring, transport-level failure classification,
server-side display enrichment, and limited one- or two-card results remain
deferred.

## Verification

Focused state-model tests verify detached deep snapshots and exact safe copy for
every supported failure. Component tests verify:

- accessible loading and result-busy behavior;
- duplicate-submission protection;
- the honest empty state;
- validation, authentication, timeout, and upstream messages;
- non-reflection of a thrown unsafe error;
- retry with the detached last-submitted preferences.

The application integration test also verifies the non-live boundary, initial
three-card result, and immutable replacement of only the selected card.

Run the browser checks and production build with:

```bash
npm run test:app
npm run build
```

The automated request-state and application tests use injected requesters and
fixed local data. They perform no live TMDB request.
