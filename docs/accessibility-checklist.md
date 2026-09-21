# PickTonight accessibility checklist

Issue: #37 — Complete the accessibility checklist

Last verified: September 21, 2026

## Scope

This document records a practical WCAG 2.2 AA-informed accessibility audit of
the PickTonight MVP's core recommendation journey.

The audited journey includes:

- optional analytics consent;
- preference entry and review;
- recommendation loading and results;
- recommendation replacement;
- title details;
- save and local watchlist behavior;
- destructive confirmation dialogs;
- local-data/privacy controls;
- keyboard navigation and focus;
- zoom and narrow-layout reflow;
- screen-reader behavior.

This document is not a formal WCAG conformance certification.

## Verification summary

Issue #37 was verified using a combination of automated checks and manual
browser/assistive-technology testing.

### Automated verification

Focused accessibility verification contains:

- six axe-core scans over important rendered application states;
- five confirmation-dialog keyboard/focus contract tests;
- four deterministic authored-color contrast contract tests.

Total focused accessibility checks: 15.

The final broader verification gate also includes:

- the complete browser test suite;
- the complete server test suite;
- TMDB browser/server boundary proofs;
- lint;
- formatting;
- the production TypeScript/Vite build.

### Manual verification environment

Manual verification was completed on September 21, 2026 using:

- Google Chrome on Windows;
- keyboard-only navigation;
- Chrome browser zoom;
- Chrome responsive device emulation;
- NVDA on Windows;
- NVDA Speech Viewer.

Analytics was declined during manual accessibility verification.

## Semantic structure

Verified:

- site header and primary navigation;
- one main landmark;
- content-information/footer structure;
- labelled application regions;
- meaningful heading hierarchy;
- native buttons, inputs, selects, fieldsets, legends, links, lists, and
  dialog semantics.

NVDA heading and landmark navigation was manually verified.

Status: **Verified for the audited MVP journey.**

## Forms, instructions, and validation

Verified:

- typed-request privacy instructions are programmatically associated with the
  request control;
- Genre guidance is associated with its group;
- Exclude genres guidance is associated with its group;
- Watching with guidance is associated with its group;
- Released since year guidance is associated with the year field;
- Watch region guidance is associated with the region control;
- provider guidance is associated with the provider group;
- invalid release-year input exposes an invalid state and associated error
  guidance.

### Release-year issue found during manual testing

Manual keyboard testing found that partial year entry such as `2`, `20`, or
`202` could previously enter the strict recommendation interpretation and
throw during render.

The fix now:

- keeps transient or out-of-range years out of the strict recommendation
  request;
- leaves the application rendered while the year is incomplete;
- exposes the field as invalid while incomplete/out of range;
- prevents Review preferences from advancing with an invalid year;
- returns focus to the year field when review is attempted while invalid; and
- accepts a valid year such as 2023 normally.

The fix has model and browser regression coverage and was manually retested.

Status: **Verified.**

## Keyboard operation

The complete recommendation journey was manually completed using keyboard
navigation.

Verified:

- logical forward Tab order;
- logical reverse Shift+Tab order;
- visible focus indicators;
- preference entry and review;
- recommendation actions;
- title-detail entry;
- title-detail return focus;
- recommendation replacement focus;
- Saved-view removal focus;
- destructive-dialog initial focus;
- modal Tab containment;
- modal Shift+Tab containment;
- Escape dismissal;
- focus restoration after dialog close.

Status: **Verified manually in Chrome.**

## Dialog behavior

PickTonight uses the native HTML dialog element for destructive confirmation.

Verified behavior:

- `showModal()` is used when supported;
- the dialog is labelled by its visible title;
- its description is programmatically associated;
- Cancel receives initial focus;
- Escape closes the dialog;
- focus returns to the invoking control after cancellation;
- a deliberate post-confirmation target can be supplied;
- Tab wraps from the final action back to Cancel;
- Shift+Tab wraps from Cancel to the final action.

### Focus-containment issue found during manual testing

Initial Chrome testing found that repeated Tab navigation could leave the
dialog and reach browser chrome.

Issue #37 added explicit keyboard-boundary containment and regression tests.

Manual Chrome retesting confirmed that forward and reverse Tab navigation now
remain inside the dialog.

Status: **Verified.**

## Dynamic states and announcements

Verified live/error behavior includes:

- preference interpretation status;
- release-year validation;
- recommendation loading;
- recommendation completion;
- empty recommendation results;
- recommendation API errors;
- recommendation replacement;
- Saved-state changes;
- watch-intent confirmation;
- local-data reset confirmation/failure.

Important polite status regions use atomic announcements where the entire
updated message should be conveyed.

The recommendation-complete path provides an assistive-technology message
equivalent to "3 recommendations ready below."

NVDA verification covered recommendation loading/results, replacement, save,
and confirmation behavior.

Status: **Verified for the audited journey.**

## Focus management

Verified:

- opening title details moves programmatic focus to the title heading;
- returning from title details restores focus to the invoking Details control;
- recommendation replacement places focus on the changed recommendation;
- Saved-item removal moves focus to a meaningful surviving action;
- an empty Saved list provides a meaningful action target;
- dialog close restores focus predictably.

Status: **Verified.**

## Focus appearance

Issue #37 provides an application-level `:focus-visible` fallback in addition
to component-specific focus styling.

Verified:

- keyboard focus remains visible on dark application surfaces;
- keyboard focus remains visible on light Saved surfaces;
- focus styling remains visible during the audited zoom/reflow checks;
- forced-colors mode has an explicit focus fallback in CSS.

Authored focus-indicator color pairs covered by the contrast proof meet the
audited 3:1 non-text threshold against their specified adjacent surfaces.

Status: **Verified for the audited authored combinations.**

## Contrast

Issue #37 fixed light-surface foreground inheritance in the Saved experience.

Deterministic source-level contrast contracts verify representative authored
pairs for:

- normal text on dark surfaces at 4.5:1 or greater;
- Saved-view text on light surfaces at 4.5:1 or greater;
- authored focus indicators at 3:1 or greater against their audited adjacent
  surfaces;
- selected/current-control text against its authored fills.

The proof does not attempt to model anti-aliasing, user styles, or every
possible runtime pixel adjacency.

Status: **Automated authored-color contracts passed; visual browser inspection
completed during manual testing.**

## Color-independent meaning

Verified:

- preference toggles expose pressed state programmatically;
- current navigation exposes `aria-current`;
- Saved state includes text/state, not color alone;
- errors include textual explanations;
- confirmation/success states include textual explanations.

NVDA manually announced toggle state changes.

Status: **Verified.**

## Images and alternatives

Verified:

- recommendation posters provide meaningful title-specific alternatives when
  available;
- missing posters provide an accessible title-specific unavailable message;
- title-detail poster behavior follows the same rule;
- Saved poster behavior follows the same rule;
- decorative PT placeholder lettering is hidden from assistive technology.

NVDA manual testing confirmed that decorative placeholder content did not
replace the meaningful poster alternative.

Status: **Verified.**

## Reflow, zoom, and text resizing

Manual Chrome verification covered:

- 200% browser zoom;
- 320 CSS-pixel responsive width;
- preference entry;
- expanded More preferences;
- preference review;
- recommendation cards;
- title details;
- Saved/local-data controls;
- destructive confirmation dialog.

Verified during the audit:

- no required ordinary-content horizontal page scrolling;
- headings wrapped rather than being clipped;
- recommendation content remained readable;
- primary actions remained reachable;
- controls remained usable;
- dialog content remained usable;
- focus indicators were not clipped in the checked states.

Status: **200% zoom and 320 CSS-pixel reflow passed manual verification.**

## Screen-reader verification

Manual NVDA + Chrome verification completed:

1. heading and landmark navigation;
2. form-field names, descriptions, and release-year validation;
3. pressed/not-pressed preference state;
4. recommendation loading/result announcements;
5. title-detail focus entry and return;
6. save and replacement state/context;
7. poster alternatives and decorative-content handling;
8. reset-dialog naming, description, focus containment, Escape handling, and
   focus restoration.

NVDA Speech Viewer was used during the walkthrough.

Status: **Verified manually for the audited NVDA + Chrome journey.**

## Automated accessibility tools

PickTonight uses direct axe-core integration rather than treating automated
results as a substitute for manual testing.

The jsdom axe scan covers WCAG A/AA tags relevant to the test environment.

`color-contrast` remains disabled inside jsdom because a jsdom environment
cannot provide the real browser paint/layout information required for a
trustworthy rendered contrast result. Authored color contracts are tested
separately against CSS source values and were supplemented by manual visual
inspection.

## Known limitations

This audit is intentionally scoped and does not claim universal accessibility
or formal WCAG conformance.

In particular:

1. one browser/assistive-technology combination was manually audited;
2. the audit does not cover every possible browser, operating system, user
   stylesheet, extension, or assistive technology;
3. static color-contract checks do not model every runtime compositing case;
4. usability testing by people with disabilities would provide additional
   evidence beyond this developer-led functional audit;
5. broader supported-browser/viewport coverage remains part of the later MVP
   browser/responsive verification work.

Within the stated Issue #37 scope, all recorded automated and manual checks
completed successfully after the two manual findings were repaired and
retested.
