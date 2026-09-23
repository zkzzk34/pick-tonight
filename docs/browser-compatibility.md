# Browser and viewport compatibility

Issue #40 verifies that the PickTonight recommendation journey remains
understandable and operable across representative browser engines and viewport
sizes.

## Supported automated browser engines

The automated browser matrix uses Playwright 1.63.0:

| Engine | Playwright 1.63 bundled version |
| --- | --- |
| Chromium | 153.0.8010.12 |
| Firefox | 155.0 |
| WebKit | 26.6 |

These are Playwright-controlled browser builds. They are not a claim that every
branded browser release, extension combination, operating system, or physical
device has been tested.

In particular, Playwright WebKit is not branded Safari. Linux WebKit CI is used
as the representative WebKit compatibility gate; physical Safari/macOS/iOS
validation can be added if pilot requirements later demand it.

`npm run test:e2e:versions` launches the installed browsers and records their
actual reported versions in the verification output.

## Viewport matrix

The selected compatibility matrix is boundary-focused and deterministic:

| Class | Viewport |
| --- | --- |
| Narrow phone | 320 × 568 |
| Larger phone | 430 × 932 |
| Tablet | 768 × 1024 |
| Laptop | 1366 × 768 |
| Wide desktop | 1920 × 1080 |

The compatibility test overrides the Playwright page viewport directly. These
are representative CSS viewport sizes, not claims of testing a particular
physical phone, tablet, or monitor model.

## Cross-browser strategy

The complete Issue #39 critical journey now runs in:

- Chromium;
- Firefox;
- WebKit.

The broader layout matrix is intentionally balanced:

- Chromium: all five viewport classes;
- Firefox: narrow phone and laptop;
- WebKit: narrow phone and laptop.

This keeps the three engines on the full critical product journey while using
Chromium for the denser responsive-layout matrix.

## What is verified

The compatibility suite checks:

- no unintended document-level horizontal scrolling;
- visible primary controls meet at least the 24 × 24 CSS pixel pointer-target
  baseline;
- high-use controls are approximately 44 CSS pixels or larger;
- picker controls remain operable;
- recommendation cards remain visible and usable;
- poster placeholders reflow correctly;
- title details remain usable;
- destructive confirmation dialogs remain usable;
- long title, overview, genre, and deliberately lengthened control text wrap
  without relying on short English labels;
- loading state on the narrow-phone layout;
- empty state on the narrow-phone layout;
- recoverable error and retry on the narrow-phone layout;
- replacement and optional-feedback state on the narrow-phone layout;
- consent persists through a browser reload;
- the local watchlist persists through a browser reload;
- title-detail `Back to 3 picks` returns to the existing recommendation
  session;
- Saved and Choose application navigation remains operable;
- a deterministic 200% text-only sizing stress remains usable without
  horizontal overflow.

## Navigation scope

PickTonight currently models Recommendations, Details, and Saved as in-page
application state. It does not create URL history entries for those views.

Issue #40 therefore verifies the navigation the current product actually
exposes, including:

- `Back to 3 picks`;
- `Saved`;
- `Choose`;
- preserving the active recommendation session when returning from title
  details or Saved during the same application session.

Adding browser History API routing would be a new product feature and is outside
this compatibility issue.

## Text sizing and touch targets

WCAG 2.2 Success Criterion 2.5.8 defines a 24 × 24 CSS pixel minimum target
baseline, subject to its documented exceptions.

For PickTonight, the compatibility gate is intentionally stronger for high-use
controls. Picker chips, primary recommendation actions, navigation, dialog
actions, and similar decision controls are kept at approximately 44 CSS pixels
or larger.

The 200% test uses a deterministic root text-size increase. It is intended to
stress authored reflow and text resizing rather than reproduce each browser's
full-page zoom implementation.

Issue #40 also adds inherited `overflow-wrap: anywhere` to the application shell
so unusually long translated-content-ready text can wrap rather than forcing
the page wider.

## Compatibility defects fixed during verification

The compatibility matrix exposed a WebKit-specific usability defect at the
narrow-phone viewport with 200% text sizing.

A long poster-placeholder title could exceed the placeholder's preferred 2:3
aspect-ratio box and overlap the preceding `Back to 3 picks` control. The
overlapping placeholder text then intercepted pointer input.

The placeholder now uses overflow-safe block-axis alignment. Its content remains
centered when it fits, but if enlarged or translated text would overflow the
placeholder, alignment falls back to the block-start edge rather than allowing
centered content to paint upward over the preceding control.

The regression remains covered by a normal Playwright click rather than a
forced click, so future overlap that blocks real pointer input will fail the
compatibility test.

## Screenshots and artifacts

Issue #40 retains the Issue #39 artifact policy:

- screenshot only on failure;
- trace retained only on failure;
- video disabled;
- no committed visual-regression snapshots;
- GitHub Actions uploads test results and the HTML report only after failure.

Compatibility is asserted structurally rather than through brittle
pixel-perfect screenshot baselines.

## Privacy and external requests

The browser suite continues to run with:

`VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT=test`

and the provider-disabled analytics environment.

The E2E browser also blocks non-local HTTP(S) requests. Recommendation responses
come only from checked-in deterministic fixtures through the explicit E2E seam.

## Known limitations

The automated matrix does not claim:

- physical-device validation;
- branded Safari validation;
- every Chrome, Edge, Firefox, or Safari release;
- operating-system-specific browser chrome or virtual-keyboard behavior;
- real finger ergonomics or touch latency;
- live TMDB/recommendation API compatibility.

The browser recommendation flow still uses the explicit deterministic E2E
request seam. Production browser-to-recommendation-API integration remains
separate work.

No blocking compatibility defect should be waived silently. Any defect found by
the final matrix must be fixed in Issue #40 or moved to an explicitly
prioritized follow-up issue before Issue #40 is closed.

## Commands

Install all supported Playwright browsers locally:

```sh
npx playwright install chromium firefox webkit
```

Print actual installed browser versions:

```sh
npm run test:e2e:versions
```

Run only the compatibility coverage:

```sh
npm run test:e2e:compatibility
```

Run only the critical journey across all supported engines:

```sh
npm run test:e2e:critical
```

Run the complete Playwright gate:

```sh
npm run test:e2e
```
