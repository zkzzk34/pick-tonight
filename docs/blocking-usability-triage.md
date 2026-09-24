# Blocking usability triage

Issue: #43 — Fix blocking usability issues

Baseline reviewed: `d73445adc3027fb897c44a50c5eb648470437ef5`

Review date: September 24, 2026

## Purpose

Issue #43 checks whether any known usability or accessibility problem still
prevents or seriously hinders a credible PickTonight pilot.

The review intentionally does not invent participant findings.

Issue #42 was closed before formal moderated participant sessions were run, so
there is no Issue #42 participant finding set, participant frequency count, or
moderated-study severity dataset to analyze.

Instead, this review uses the real evidence already produced by accessibility
verification, browser compatibility testing, production deployment QA,
synthetic pre-session verification, regression tests, and deployed-product
checks.

## Triage method

Severity is classified as:

- **Critical** — prevents completion of a primary journey or causes loss of the
  usable application state.
- **High** — seriously hinders a primary journey step, recovery path, keyboard
  path, or assistive-technology path.
- **Medium** — causes meaningful friction but leaves the primary journey
  usable.
- **Low** — cosmetic or minor friction that does not materially hinder the
  journey.

Frequency describes reproducibility from the available evidence rather than
participant incidence:

- **Deterministic** — reproduced consistently under the documented trigger.
- **Environment-specific** — reproduced consistently only under a documented
  browser, viewport, input, or other environment.
- **Not measured** — no participant-frequency evidence exists.

Product impact is recorded against the Issue #43 primary areas: consent,
preference submission, recommendation evaluation, recovery, watch intent,
keyboard/assistive technology, compatibility, and quality verification.

## Evidence reviewed

The review includes:

- `docs/accessibility-checklist.md`;
- `docs/playwright-critical-flow.md`;
- `docs/browser-compatibility.md`;
- `docs/pilot-deployment.md`;
- the Issue #39 critical Playwright journey;
- the Issue #40 browser/viewport compatibility matrix;
- the Issue #41 deployed-pilot verification;
- PR #91, conversational preference-input crash repair;
- PR #92, explicit freshness soft-ranking repair.

## Recorded blocking or high-impact findings

| Finding | Severity | Frequency | Product impact | Resolution |
| --- | --- | --- | --- | --- |
| Partial release-year input could enter strict interpretation and throw during render | High | Deterministic while entering an incomplete year | Preference submission; keyboard accessibility | Fixed and regression-tested in Issue #37 |
| Repeated keyboard Tab navigation could leave a destructive dialog | High | Deterministic keyboard trigger in the audited browser | Keyboard and assistive-technology operation | Fixed and manually retested in Issue #37 |
| Long poster-placeholder content could overlap and intercept a preceding control in WebKit at narrow width with enlarged text | High | Environment-specific | Recommendation evaluation and navigation | Fixed and protected by Playwright coverage in Issue #40 |
| Conversational free-text entry could blank the application because a deferred state updater read a released React event target | Critical | Deterministic under the reproduced typing path | Preference submission | Fixed in PR #91 with browser regression coverage and production verification |
| Explicit freshness preference contributed no ranking points even though the UI presented it as a preference | High | Deterministic when freshness was selected | Recommendation evaluation and trust | Fixed in PR #92 as the `recommendation-v4` strong soft preference and production-verified |

No formal participant-frequency claims are made for these findings because the
moderated Issue #42 sessions were not conducted.

## Issue #43 fresh verification

Issue #43 reran the current quality evidence from the
`d73445adc3027fb897c44a50c5eb648470437ef5` baseline.

Verified:

- browser test suite: **190/190 passed** when run serially;
- API/server suite: **135/135 passed**;
- TMDB browser/server boundary suite: **11/11 passed**;
- focused accessibility regression: passed;
- authored accessibility contrast contracts: passed;
- critical Playwright journey: **9/9 passed** across Chromium, Firefox, and
  WebKit.

The first full parallel Vitest run produced several five-second timeouts under
concurrent test load. The same 190 browser tests then passed serially. This
matches the resource-related parallel-run behavior already documented in PR
#92 and is not evidence of ten independent product regressions.

## Quality-tooling finding

Issue #43 also reproduced a lint-boundary problem after local Vercel deployment
artifacts existed.

Git already ignores `.vercel/`, but ESLint's flat configuration did not include
that generated directory in its global ignore list. As a result,
`npm run lint` attempted to lint compiled Vercel Functions and minified browser
artifacts under `.vercel/output`, producing errors unrelated to PickTonight
source code.

Issue #43 adds `.vercel/**` to the existing ESLint generated-file ignore
boundary.

This does not weaken lint rules for application, server, shared, test, proof, or
configuration source files.

## Current blocking status

No unresolved reproducible Critical or High usability/accessibility blocker was
identified from the available evidence after the recorded fixes.

In particular, current automated evidence covers:

- analytics consent acceptance and decline;
- preference entry and review;
- recommendation loading and evaluation;
- title details;
- save and local watchlist behavior;
- rejection and replacement;
- recoverable recommendation-request failure;
- watch-intent confirmation;
- keyboard focus and dialogs;
- automated WCAG A/AA checks;
- Chromium, Firefox, and WebKit critical-flow execution.

This conclusion is limited to the evidence actually collected. It is not a
claim that the product is universally defect-free.

## Nonblocking observations and limitations

The following remain nonblocking limitations or deferred observations:

1. Manual assistive-technology verification has covered NVDA with Chrome rather
   than every browser, operating system, screen reader, extension, or user
   stylesheet combination.
2. Automated WebKit coverage is representative engine coverage and is not a
   claim of physical branded Safari, macOS, or iOS validation.
3. The compatibility matrix uses representative emulated viewport sizes rather
   than physical-device testing and does not measure real finger ergonomics,
   virtual-keyboard behavior, or device-specific latency.
4. Automated source-level contrast checks do not model every possible runtime
   compositing or user-style case.
5. The advanced-preferences layout has a known visual-alignment inconsistency
   around Origin country, Watch region, Freshness, and Content language. It is
   nonblocking and is intentionally deferred until the planned consolidated
   post-MVP UI/UX review rather than being mixed into blocking-quality work.
6. No formal Issue #42 participant usability sessions were conducted, so real
   participant behavior remains future evidence rather than something inferred
   here.

The advanced-preferences visual observation is not converted into a standalone
implementation issue during Issue #43 because the agreed product plan is to
complete the MVP first and then perform one consolidated owner-led UI/UX review.

## MVP boundary

No new product feature is justified by the Issue #43 evidence.

Issue #43 therefore does not add routing, personalization, localization,
additional recommendation controls, or any other unsupported feature in
response to isolated observations.

## Conclusion

All previously recorded Critical or High findings in the primary journey have
documented repairs and regression evidence.

Fresh Issue #43 verification found no unresolved blocking product defect.

The only new reproducible problem identified during Issue #43 was the
development-quality boundary in which ESLint inspected generated
`.vercel/output` artifacts. That tooling boundary is corrected without changing
runtime product behavior.
