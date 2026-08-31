# PickTonight Low-Fidelity Product Flow

- **Status:** Proposed mobile-first flow for prototype testing
- **Owner:** ZK Zhao
- **Date:** August 31, 2026
- **Related issue:** [#6 — Create the low-fidelity product flow](https://github.com/zkzzk34/pick-tonight/issues/6)
- **Requirements:** [Product Requirements and Research Boundaries](./product-requirements.md)
- **Research evidence:** [Discovery Interview Synthesis](./discovery-interview-synthesis.md)
- **Privacy behavior:** [Privacy, Local Data, and Optional Analytics](./privacy-and-local-data.md)

## Purpose

This document defines the first low-fidelity, mobile-first PickTonight flow. It turns the confirmed founder requirements and exploratory discovery findings into a testable sequence from an uncertain viewing preference to a confident watch-intent decision.

It is a flow specification, not a polished visual design or implementation. Labels, information hierarchy, and interaction timing remain subject to usability testing.

Exactly three initial recommendations and the under-two-minute goal remain prototype hypotheses. Showing them in this flow does not mean discovery validated them.

## Design principles

1. **Flexible input, constrained output.** A viewer may start with supported words, selectable preferences, or both, while the initial result remains limited to exactly three eligible recommendations.
2. **A broad request is valid.** Optional preferences are progressively disclosed and never required merely to continue.
3. **Interpret before recommending.** Supported text becomes editable structured preferences before the recommendation request is submitted.
4. **Separate restrictions from preferences.** Hard restrictions affect eligibility; soft preferences affect ranking.
5. **Show enough evidence without recreating a catalog.** Results expose a concise fit explanation first and progressively disclose additional details.
6. **Correct one problem without restarting.** A single recommendation can be replaced while the other results and current preferences remain stable.
7. **Keep actions semantically distinct.** Watch intent, saving, temporary rejection, lasting taste feedback, already-watched status, and replacement are not interchangeable.
8. **Keep local data and analytics choices separate.** The core decision flow works without an account, analytics, or personalization.
9. **State uncertainty honestly.** Missing data, unsupported text, and insufficient eligible results are not silently guessed or relaxed.

## Flow overview

### Shortest successful path

~~~mermaid
flowchart TD
    A["1. Start with words or tags"] --> B["2. Review interpreted preferences"]
    B --> C["3. View three recommendations"]
    C --> D["4. Choose tonight"]
    D --> E["5. Confirm the decision"]
~~~

This path requires one preference-entry screen, one interpretation checkpoint, one results screen, and one decision action. The confirmation screen records watch intent; it does not claim completed viewing.

### Result exploration and correction

~~~mermaid
flowchart TD
    A["Three recommendations"] --> B["Open title details"]
    A --> C["Open feedback actions"]
    A --> D["Save in this browser"]
    B --> E["Choose tonight"]
    C --> F["Replace one result"]
    C --> G["Offer optional personalization"]
    D --> H["Open saved titles"]
~~~

### Insufficient-result recovery

~~~mermaid
flowchart TD
    A["Submit interpreted preferences"] --> B{"Eligible title count"}
    B -->|"Three or more"| C["Show three recommendations"]
    B -->|"One or two"| D["Show limited results"]
    B -->|"Zero"| E["Show no confirmed matches"]
    D --> F["Edit required restrictions"]
    E --> F
    F --> A
~~~

The product never invents a third title, silently relaxes a hard restriction, or describes missing provider data as confirmed unavailability.

## Shortest-path screen sequence

| Step | Screen | Viewer action | Product response | Primary test question |
|---|---|---|---|---|
| 1 | Start | Enter supported words, select tags, or do both | Shows the current request as **Broad**, **Focused**, or **Very specific** | Can someone begin without completing a questionnaire? |
| 2 | Review interpretation | Correct, add, or remove structured preferences | Shows the exact hard restrictions and soft preferences that will be submitted | Does the interpretation create clarity without slowing the viewer down? |
| 3 | Results | Compare exactly three eligible recommendations | Shows a concise reason for each result and access to supporting details | Is three enough choice, and is the first information layer useful? |
| 4 | Choose | Select **Choose tonight** on one title | Records current watch intent and opens confirmation | Can the viewer commit confidently without additional browsing? |
| 5 | Decision confirmation | Open a provider or trailer link, return to results, or start a new decision | Keeps the meaning of watch intent distinct from completed viewing | Is the outcome clear and trustworthy? |

The two-minute promise should be timed from the viewer's first intentional preference action through **Choose tonight**. Time on an optional analytics prompt, saved-title management, or post-decision provider navigation should be reported separately.

## Screen 1 — Start and preference entry

### Goal

Let an uncertain viewer express as much or as little as they currently know.

### Mobile layout

| Region | Low-fidelity content |
|---|---|
| Top bar | **PickTonight**, **Saved**, and **Settings** |
| Main prompt | **What would feel right to watch?** |
| Free-form field | Optional input with an example such as "funny Korean movie under two hours" |
| Quick preferences | Small selectable controls for media type, mood, genre, and available time |
| Progressive disclosure | **More preferences** reveals companion, freshness, language, origin, region, and provider controls |
| Selectivity status | **Broad**, **Focused**, or **Very specific**, followed by an explanation that the label describes selectivity rather than accuracy |
| Privacy note | "Your typed request is used for this decision and is not saved to your watchlist, taste profile, or analytics." |
| Primary action | **Review preferences** |

### Behavior

- The free-form field and quick preferences are both optional.
- A viewer may use text only, tags only, both, or neither.
- An empty or minimally specified request remains **Broad** and may continue.
- More preferences stay collapsed until requested.
- Additional selections may focus the candidate set but must not be described as increasing accuracy.
- Raw preference text remains active-session information.

## Screen 2 — Review interpreted preferences

### Goal

Make the deterministic interpretation visible and correctable before requesting recommendations.

### Mobile layout

| Region | Low-fidelity content |
|---|---|
| Heading | **Review what we understood** |
| Required restrictions | Editable rows for explicit media type, excluded genres, maximum time, and required provider availability |
| Soft preferences | Editable rows for mood, preferred genres, freshness, companion fit, content language, and origin country |
| Viewing access | Separate rows for watch region and selected streaming providers |
| Unrecognized text | Honest notice for unsupported or ambiguous words, with **Add a preference**, **Ignore**, and **Edit request** paths |
| Selectivity status | Current **Broad**, **Focused**, or **Very specific** label with the selectivity-only explanation |
| Primary action | **Show 3 picks** |
| Secondary action | **Back to request** |

### Behavior

- Every interpreted item can be edited or removed independently.
- A viewer can add a preference without re-entering the full request.
- Unsupported text is never silently converted into a preference.
- Current-session preferences take priority over optional historical taste signals.
- The recommendation request uses the reviewed structured representation, not an unreviewed guess.

## Preference concepts that remain separate

| Concept | Placement in the flow | Meaning |
|---|---|---|
| Interface language | Settings; displayed as English for the MVP | Language used by PickTonight's interface |
| Content language | Optional soft preference | Spoken or primary language of a title |
| Origin country | Optional soft preference | Country associated with the title's origin |
| Watch region | Viewing-access setting | Region used to interpret provider availability |
| Streaming providers | Optional required-availability selection | Services the viewer wants confirmed in the selected watch region |

These concepts must not be collapsed into one country, language, or provider field. The flow does not infer precise location.

## Selectivity labels

| Label | Proposed explanation |
|---|---|
| **Broad** | "You have left plenty of room for variety. You can continue now." |
| **Focused** | "A few preferences are narrowing the candidate set." |
| **Very specific** | "Several requirements may leave fewer eligible titles." |

The exact thresholds remain an implementation and usability-testing decision. The labels never promise that a more specific request is more accurate.

## Screen 3 — Recommendation results

### Goal

Present exactly three explainable recommendations when at least three eligible titles exist.

### Mobile layout

| Region | Low-fidelity content |
|---|---|
| Heading | **3 picks for tonight** |
| Request summary | Compact structured-preference summary with **Edit preferences** |
| Result card | Poster placeholder, title placeholder, year, media type, concise fit explanation, runtime or episode-length context, rating context, and provider status when supported |
| Primary card action | **Choose tonight** |
| Secondary card actions | **Details**, **Save**, and **Replace** |
| Feedback control | **More actions** opens the distinct feedback choices |
| Session control | **Start a new decision** |

The initial results use neutral placeholders such as **Title A**, **Title B**, and **Title C**; the low-fidelity document does not invent entertainment metadata.

### Behavior

- Results preserve the order returned by the recommendation service.
- The first layer emphasizes why a title fits the current request.
- Additional evidence is progressively disclosed through title details.
- Ratings appear as supporting context rather than a universal definition of quality or personal fit.
- Missing information is labeled unavailable or unknown rather than shown as negative evidence.
- There is no infinite result feed and no initial **Show more** action.

## Screen 4 — Title details

### Goal

Provide enough supporting evidence to verify an attractive candidate without requiring another search source.

### Mobile layout

| Region | Low-fidelity content |
|---|---|
| Header | Back to results, title placeholder, year, and media type |
| Fit explanation | Structured reasons tied to the current preferences |
| Title evidence | Overview, genres, runtime or episode context, freshness, and rating-confidence context |
| Viewing access | Provider categories for the selected watch region, or an honest unknown state |
| Verification | Suitable trailer link when normalized source data provides one |
| Actions | **Choose tonight**, **Save**, **More actions**, and **Back to results** |

### Behavior

- Provider information remains regional and may be incomplete.
- Missing provider information is not presented as confirmed unavailability.
- The trailer is a link to supported external content; PickTonight does not host video.
- Explanations describe the recommendation logic but do not promise enjoyment.

## Screen 5 — Feedback and recommendation actions

### Goal

Let the viewer communicate a precise current-session intent without collapsing every action into like or dislike.

| Action | Low-fidelity response |
|---|---|
| **Choose tonight** | Opens decision confirmation and records watch intent, not completed viewing |
| **Save** | Adds the title to the local watchlist and confirms "Saved in this browser" |
| **More like this** | Applies a positive signal to the active decision; it becomes a lasting local taste signal only when personalization is enabled |
| **Not tonight** | Excludes the title from the active session without creating a lasting negative taste signal |
| **Not my taste** | Excludes the title from the active session; it becomes a lasting local negative signal only when personalization is enabled |
| **Already watched** | Excludes the title without treating it as disliked; it is remembered after the session only when personalization is enabled |
| **Replace** | Replaces only the selected recommendation under the same current preferences, with no taste inference |

When an exclusion leaves an open result position, the flow requests a replacement for that position. Optional structured reasons may be offered, but free-form reason text remains outside persistent storage and analytics.

## Screen 6 — Individual replacement

### Goal

Correct one unsuitable recommendation without discarding the other two or restarting the decision.

### Sequence

1. The viewer selects **Replace** or uses an exclusion action that requests a replacement.
2. Only the selected card enters a loading state.
3. The other two cards remain visible and unchanged.
4. The service uses the same reviewed preferences and excludes every title already shown in the active session.
5. The new card appears in the same position with a short **Replacement** status announcement.

If no eligible replacement is available, the slot shows an honest insufficient-result state with **Edit required restrictions**. The product does not repeat a previously shown title or silently loosen a hard restriction.

## Screen 7 — Decision confirmation

### Goal

Confirm that the viewer selected a title while preserving the boundary between watch intent and completed viewing.

### Mobile layout

| Region | Low-fidelity content |
|---|---|
| Heading | **Tonight's pick** |
| Selected title | Poster placeholder, title placeholder, and concise fit explanation |
| Next steps | Supported provider destination and trailer link when available |
| Local action | **Save** if the title is not already saved |
| Correction | **Change choice** returns to the existing result set |
| New session | **Start a new decision** clears the prior active-session state |

The screen does not claim that the viewer started or completed the title.

## Screen 8 — Saved titles

### Goal

Let the viewer revisit explicitly saved titles without requiring an account or treating saving as proof of positive taste.

### Mobile layout and behavior

- A **Saved in this browser** confirmation appears immediately after **Save**.
- **View saved titles** opens the local watchlist.
- Each saved title has **View details** and **Remove**.
- **Clear watchlist** requires confirmation.
- The screen explains: "Saved titles stay in this browser and do not synchronize with another browser or device."
- The watchlist remains separate from the optional taste profile.
- Clearing the watchlist does not clear unrelated personalization or analytics choices.

## Screen 9 — Limited and empty results

### One or two eligible titles

Proposed message:

> We found fewer than three titles that meet every required restriction. We will not relax your required restrictions.

The screen shows the confirmed eligible titles, identifies the required restrictions that reduced the set, and offers **Edit required restrictions**.

### Zero confirmed eligible titles

Proposed message:

> We could not confirm any titles that meet every required restriction. Review the requirements below to broaden the eligible set.

The screen lists the active hard restrictions and offers **Edit required restrictions** and **Start a new decision**.

### Data uncertainty

When eligibility depends on missing provider or runtime data, the message distinguishes "We could not confirm a match" from "No matching title exists."

## Privacy, personalization, and analytics moments

| Moment | Explanation or choice | Effect on the core path |
|---|---|---|
| Preference entry | Typed words remain limited to the active decision and are not persisted or placed in analytics | Informational; never blocks continuation |
| First **Save** | Saved titles remain in the current browser without an account or synchronization | Confirms local watchlist behavior |
| **More like this** or **Not my taste** while personalization is off | Apply the action to the current session, then optionally offer **Enable personalization**, **Not now**, and **Learn what is stored** | Declining does not undo the session action or block replacement |
| First visit, outside the required path | Offer **Allow analytics**, **No thanks**, and **Review details** with comparable prominence | Separate from personalization and never required for recommendations |
| Settings | Separate controls for analytics consent, personalization, watchlist, taste profile, and complete reset | Management path outside the shortest decision flow |

Proposed personalization explanation:

> Personalization is optional. If enabled, PickTonight stores a small taste profile in this browser using actions such as **More like this** and **Not my taste**. The current request always takes priority, and nothing synchronizes to another device.

Proposed analytics explanation:

> Optional analytics can record limited named interactions, such as whether results loaded or which action was used. They do not receive the typed request, written feedback, title descriptions, or local taste-profile contents. All core features remain available if analytics are declined.

The analytics and personalization choices must never be combined into one consent control.

## Prototype states to include

The low-fidelity prototype should demonstrate:

1. Broad text-only entry.
2. Tags-only entry.
3. Combined text and tags.
4. Correct interpretation.
5. Unsupported or ambiguous text.
6. Editing one interpreted preference.
7. Exactly three eligible results.
8. Title-details progressive disclosure.
9. Each distinct action.
10. Successful one-card replacement.
11. Replacement exhaustion.
12. One- or two-result limitation.
13. Zero confirmed matches.
14. Save confirmation and saved-title management.
15. Personalization declined and enabled.
16. Analytics declined and enabled.
17. Decision confirmation and change-choice recovery.

## Prototype-testing questions

The first usability sessions should investigate:

1. Can a viewer reach results without believing every optional preference is required?
2. Does the interpretation screen feel protective and correctable rather than redundant?
3. Do **Broad**, **Focused**, and **Very specific** communicate selectivity without implying accuracy?
4. Are exactly three initial recommendations enough for recognition without creating a new browsing loop?
5. Which information belongs on the result card versus title details?
6. Do viewers understand the differences among **Replace**, **Not tonight**, **Not my taste**, and **Already watched**?
7. Does one-card replacement preserve context and reduce correction cost?
8. Can a viewer make a confident choice within two minutes?
9. Are limited-result explanations honest and actionable?
10. Do viewers understand that watchlist, personalization, and analytics are separate?

## Issue #6 acceptance-criteria mapping

| Acceptance criterion | Flow coverage |
|---|---|
| Cover entry, interpretation, results, details, feedback, replacement, decision, and saved titles | Screens 1–8 |
| Allow words, tags, or both | Screen 1 and prototype states 1–3 |
| Convert supported text into editable structured preferences before results | Screen 2 |
| Correct interpretation without re-entering the request | Screen 2 independent edit and removal behavior |
| Keep the shortest interaction brief | Five-step shortest-path sequence |
| Do not require every optional preference | Screen 1 progressive disclosure and broad-request path |
| Separate interface language, content language, origin, region, and providers | Preference-concepts table |
| Show **Broad**, **Focused**, or **Very specific** without an accuracy claim | Selectivity-label section |
| Show exactly three initial recommendations | Screen 3 |
| Replace one recommendation without restarting | Screen 6 |
| Include all seven distinct actions | Screen 5 action table |
| Include honest limited and empty states | Screen 9 |
| Include privacy and optional-personalization explanations where relevant | Privacy, personalization, and analytics moments |

## Scope boundary

This issue produces a reviewable flow specification. It does not:

- implement React components or application state;
- select fonts, colors, illustration style, or final spacing;
- finalize recommendation logic or preference-parser support;
- claim that the flow meets the two-minute promise;
- claim that exactly three results or individual replacement has been validated;
- implement analytics, personalization, local storage, or TMDB access;
- add accounts, group profiles, voting, or group-preference matching.

Implementation issues should treat this document as a testable interaction hypothesis and update it when usability or technical evidence requires a material change.
