# PickTonight Product Requirements and Research Boundaries

- **Status:** Confirmed founder baseline for the MVP
- **Owner:** ZK Zhao
- **Date:** August 16, 2026
- **Related issue:** [#49 — Document refined founder requirements and reconcile the MVP backlog](https://github.com/zkzzk34/pick-tonight/issues/49)

## Purpose

This document is the source of truth for PickTonight's current founder requirements, research assumptions, evidence boundaries, and post-MVP ideas.

The product brief explains the product at a higher level. GitHub issues translate these requirements into implementation work. Discovery findings may motivate later changes, but they must not silently replace confirmed requirements.

## Product principle

> Flexible input, constrained output.

PickTonight should help someone choose what to watch in under two minutes. It should compete on decision quality, trust, and speed rather than on presenting the largest possible catalog.

## Confirmed founder requirements

### Decision outcome

- PickTonight supports one immediate movie-or-television decision.
- The initial result contains exactly three recommendations when at least three eligible candidates exist.
- If fewer than three eligible candidates exist, the interface must report that honestly rather than relaxing a hard restriction silently.
- An unsuitable recommendation can be replaced individually without restarting the decision.
- A replacement uses the same current preferences and excludes titles already shown during the active session.

### Preference entry

A user may begin in any of these ways:

1. Enter a few words describing what they want.
2. Select simple preference tags or controls.
3. Combine supported text with selected preferences.

Examples of supported text may include:

- `funny Korean movie under two hours`
- `something light to watch with friends`
- `recent mystery show on a service I have`

The first-version parser must:

- be deterministic and transparent;
- recognize only documented concepts;
- map recognized concepts into normalized preference fields;
- show the interpretation before recommendations are requested;
- allow the user to add, remove, or correct interpreted preferences;
- identify unsupported or ambiguous text without inventing an interpretation;
- fall back to the guided controls when needed;
- never select titles or invent entertainment metadata.

Raw free-form preference text must remain limited to the active browser session. It must not be placed in analytics or persistent application storage.

### Preference dimensions

The normalized preference model may include:

- movie, television, or either;
- mood;
- preferred genres;
- excluded genres;
- maximum available time;
- viewing companions;
- freshness;
- content language;
- origin country;
- watch region;
- available streaming providers.

Interface language, content language, origin country, and watch region are separate concepts. They must not be represented by one shared country or language field.

The MVP interface is English. Broader international discovery controls and complete English/Simplified Chinese localization remain separately planned work.

### Interaction depth

- The shortest successful path must remain very brief.
- Optional preferences may narrow the candidate set and focus the ranking.
- More selections must not automatically be described as producing greater accuracy.
- A broad request is valid.
- The interface may describe a request as `Broad`, `Focused`, or `Very specific`.
- That description communicates selectivity, not a promise of recommendation accuracy.

### Hard restrictions and soft preferences

Hard restrictions determine eligibility and are applied before scoring.

Current hard-restriction examples include:

- explicit movie or television selection;
- excluded genres;
- maximum runtime or episode-length limit;
- required availability from a selected provider in the selected watch region.

Soft preferences affect ranking without automatically excluding an otherwise eligible title.

Current soft-preference examples include:

- mood;
- preferred genres;
- freshness;
- rating-confidence preference;
- viewing-companion fit;
- supported content-language or origin-country preferences.

The implementation must preserve the distinction between hard restrictions and soft preferences in the request contract, recommendation logic, explanations, and tests.

Current-session preferences always take priority over historical taste signals.

### Recommendation presentation

Each recommendation should provide, when supported by normalized source data:

- accessible poster or placeholder;
- title;
- year;
- movie or television type;
- concise overview;
- genres;
- movie runtime or useful television episode-length context;
- rating and rating-confidence context;
- freshness information;
- regional provider availability;
- suitable trailer link;
- concise explanation of why the title fits.

The interface must:

- preserve the ranking returned by the recommendation service;
- distinguish unavailable information from negative information;
- avoid describing a new title's low vote count as evidence of poor quality;
- avoid claiming provider availability when regional data is absent;
- avoid claiming social virality without supported social data;
- keep explanations tied to actual preference matches and score evidence.

### User actions and feedback semantics

PickTonight must not collapse all feedback into one ambiguous like/dislike control.

| Action | Meaning | Recommendation effect |
|---|---|---|
| `Choose tonight` | The user expresses current watch intent | Records a decision, not completed viewing |
| `Save` | The user wants to revisit the title later | Adds the title to the local watchlist; it supplies a weak taste signal only when personalization is enabled |
| `More like this` | The user explicitly wants similar recommendations | Can influence the active session; it persists as a positive taste signal only when personalization is enabled |
| `Not tonight` | The title does not fit the current situation | Excludes it from the active session without creating a lasting negative taste signal |
| `Not my taste` | The title conflicts with the user's broader taste | Excludes it from the active session; it persists as a negative taste signal only when personalization is enabled |
| `Already watched` | The user has already seen the title | Excludes it from the active session without treating it as disliked; it is remembered only when personalization is enabled |
| `Replace` | The user wants another option under the same preferences | Replaces only that recommendation and excludes titles already shown in the session |

Structured reasons may include:

- too long;
- unavailable;
- wrong mood;
- disliked genre;
- rating or content concern;
- not interested;
- another optional reason.

Optional reason text must remain outside analytics and persistent storage.

### Session state, watchlist, and personalization

The MVP distinguishes three kinds of client state:

1. Active-session decision state.
2. A local watchlist created through explicit save actions.
3. An optional local taste profile created only when the user enables personalization.

The local watchlist and taste profile must remain conceptually separate. An action may affect the active session without creating a lasting taste signal.

The optional taste profile may contain only minimal normalized data such as:

- positive and negative genre signals;
- movie or television tendency;
- supported content-language or origin-country preferences;
- saved, shown, watched, or rejected title identifiers;
- explicit `More like this` and `Not my taste` signals.

The local state requirements are:

- no account is required;
- no permanent application database is required;
- data is limited to the current browser, device, and site origin;
- the interface explains that the data does not synchronize across devices;
- taste-profile persistence occurs only when the user enables personalization;
- personalization can be disabled without preventing the core recommendation flow;
- current-session preferences override historical signals;
- storage schemas are versioned;
- unavailable, malformed, outdated, or cleared storage is handled safely;
- raw free-form preference text is never persisted;
- a complete local-data reset action is available.

### Entertainment data and recommendation boundaries

TMDB access must occur through a server-only API boundary. The browser must not receive the TMDB credential.

The MVP may use supported TMDB data including:

- movie and television discovery;
- trending, current, or recent candidate sources;
- title details;
- images;
- videos;
- genres;
- ratings and vote counts;
- regional watch-provider information.

Recommendation selection must remain deterministic, explainable, and based on normalized source data.

The MVP must not:

- scrape TikTok;
- claim TikTok virality without supported data;
- let an LLM select titles;
- let an LLM invent entertainment metadata;
- claim that PickTonight contains every title;
- treat missing provider information as confirmed unavailability;
- treat a low vote count as proof that a title is poor.

Provider information must be associated with the selected watch region. Streaming, free, advertising-supported, rental, and purchase availability must remain distinguishable when the source supports those categories.

Provider information derived through TMDB requires JustWatch attribution. TMDB's supplied destination URL may be offered when direct provider links are unavailable.

### Privacy and analytics

- Nonessential product analytics require prior consent.
- Declining analytics must not prevent use of the core recommendation flow.
- Analytics use explicit typed property allowlists.
- Analytics may use normalized codes but not raw preference text.
- Names, email addresses, credentials, precise locations, user-supplied links, written feedback, and title overviews are excluded from analytics properties.
- Free-text feedback remains separate from behavioral analytics.
- Anonymous or pseudonymous identifiers must not be derived from personal information, IP addresses, or device fingerprinting.
- Resetting local data or withdrawing consent rotates or removes the persistent analytics identifier.
- The public project must never contain raw participant records.

## Assumptions to test through discovery

The following statements are research assumptions, not confirmed facts:

1. Difficult viewing decisions occur often enough to justify a dedicated decision tool.
2. Mood, available time, companions, and provider access materially affect real decisions.
3. Exactly three options feel manageable without feeling too restrictive.
4. Explanations increase confidence in unfamiliar recommendations.
5. Viewers regularly move between multiple tools before choosing.
6. Trailers play a meaningful role in final evaluation.
7. Text input and preference controls serve different starting behaviors.
8. Individual replacement is more useful than restarting the full decision.
9. People understand and value the distinction between temporary rejection and lasting taste feedback.
10. Optional local personalization provides enough value to justify its controls and explanation.
11. Shared group-preference matching is important enough to consider after the MVP.

Discovery interviews should investigate participants' recent behavior. They should not ask participants to approve these requirements or design the application.

## Discovery scope

Discovery interviews include adult streaming viewers who meet the participant criteria in the interview guide.

The research should include variation in viewing situations, discovery sources, and companion patterns where practical.

The interviews can provide exploratory evidence and design direction, but they do not establish market size, statistical prevalence, product-market fit, or general validation.

Raw notes remain private. Public synthesis may include only anonymized themes, contradictions, outliers, design implications, and methodological limitations. Qualitative observations must not be presented as population estimates.

## Post-MVP ideas

The following work remains outside the first MVP unless a later documented decision changes scope:

- user accounts;
- cross-device synchronization;
- permanent server-side taste profiles;
- collaborative-filtering or sophisticated machine-learning personalization;
- LLM-based preference interpretation;
- complete English and Simplified Chinese localization;
- broader international-content discovery controls;
- native mobile applications;
- social profiles, feeds, or chat;
- shared group-preference matching;
- payments or subscriptions;
- video hosting or playback;
- multi-day viewing planning.

## Evidence and claim boundaries

PickTonight must distinguish what the data shows from what the product infers.

- `Choose tonight` measures watch intent, not completed viewing.
- Discovery interviews inform design but do not validate a market or support prevalence claims.
- TMDB vote data provides rating context but does not establish objective quality.
- Freshness uses supported dates or official candidate sources, not unsupported cultural claims.
- Provider data is regional and may be incomplete or change after retrieval.
- A deterministic explanation describes the recommendation logic; it does not guarantee that the user will enjoy the title.
- Pilot completion thresholds demonstrate portfolio execution, not product-market fit.

## Backlog relationships

| Area | Related issue |
|---|---|
| Discovery interviews and synthesis | #3 |
| Privacy and analytics consent | #5 |
| Low-fidelity product flow | #6 |
| Hard filters and scoring | #16 |
| Recommendation cards | #18 |
| Structured explanations | #25 |
| Preference entry and interpretation | #27 |
| Title details | #28 |
| Feedback and replacement | #29 |
| Local watchlist | #30 |
| Anonymous analytics identity | #31 |
| Analytics property verification | #34 |
| Requirements reconciliation | #49 |
| Optional local taste personalization | #50 |

## Change control

A later research or implementation finding may challenge these requirements. Any material change should:

1. cite the evidence or technical constraint;
2. identify which requirement is changing;
3. update this document and affected issues;
4. preserve the distinction between a founder decision, research evidence, and an implementation limitation.
