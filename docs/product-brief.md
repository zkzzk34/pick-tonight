# PickTonight Product Brief

- **Status:** Working draft
- **Owner:** ZK Zhao
- **Last updated:** August 31, 2026
- **Working title:** PickTonight
- **Detailed requirements:** [Product Requirements and Research Boundaries](./product-requirements.md)

> PickTonight is a working title only. Do not purchase a domain or invest in branding until name and trademark availability have been checked.

## Origin

PickTonight began with a general observation: someone can be ready to watch something and still spend substantial time deciding what to choose. That observation motivated a broader product question: how can streaming viewers move from uncertainty to a confident choice quickly?

The completed exploratory discovery round examined recent real viewing decisions and identified useful behaviors, tensions, and design questions. Its findings guide the initial product direction but do not establish prevalence, market demand, or product validation.

## Problem

A viewer can be ready to watch yet lack enough clarity or confidence to commit to a title. Repetitive results, prolonged scrolling, and switching between sources for variety or verification can consume time without producing a choice. Existing services provide many options, but they do not always make the immediate decision easier.

## Product promise

PickTonight helps someone choose what to watch in under two minutes by returning exactly three explainable recommendations suited to the current situation.

## Product principle

> Flexible input, constrained output.

PickTonight should compete on decision quality, trust, and speed rather than trying to present the largest catalog.

## Evidence-informed target user

PickTonight's initial target is an adult streaming viewer in an immediate decision situation who:

- is ready to watch a movie or show now, or choose the next series to begin, but has not committed to a title;
- may begin without a precise genre, mood, or title preference and refine the decision after seeing candidates;
- evaluates fit through a context-dependent combination of signals such as poster, synopsis, cast, trailer, tone, runtime, ratings, reviews, and another viewer's interest;
- may encounter repetitive scrolling or switch between sources for variety or verification;
- wants enough relevant evidence to choose confidently without comparing a large catalog;
- may decide alone or with another person, without requiring group accounts or group-preference matching.

## Primary viewing situation and decision trigger

The chosen primary situation is an immediate viewing decision: the viewer is ready to watch a movie or show now, or choose the next series to begin, but has not selected a title.

The trigger is the gap between wanting to watch and having enough clarity or confidence to commit. That gap may exist before browsing begins or become more noticeable when results feel repetitive, too broad, or insufficient and the viewer starts comparing or verifying candidates elsewhere.

This is PickTonight's chosen product focus, informed by exploratory observations. It is not a claim that this is the most common viewing situation across a broader population.

## Job to be done

> When I am ready to watch a movie or show but have not settled on a title or precise preference, help me quickly evaluate a few relevant options using the information that matters in this situation, so I can choose with confidence without prolonged scrolling or switching between sources.

## Proposed experience

### Start

The user can:

- enter a few supported preference words;
- select simple preference tags or controls;
- use both methods together.

Supported text is interpreted deterministically as structured preferences. The user can review and correct the interpretation before requesting recommendations.

A broad request remains valid. Additional preferences may focus the result, but the interface must not promise that more selections automatically produce greater accuracy.

### Preferences

Possible preferences include:

- movie, television, or either;
- mood;
- preferred and excluded genres;
- available time;
- viewing companions;
- freshness;
- content language or origin country;
- watch region;
- available streaming providers.

Hard restrictions, including excluded genres, maximum runtime, and required provider availability, are applied before scoring.

Soft preferences, including mood, preferred genres, freshness, and rating confidence, influence ranking without automatically excluding a title.

### Results

PickTonight returns exactly three initial recommendations when enough eligible candidates exist.

Each recommendation provides supported information such as:

- poster or accessible placeholder;
- title, year, and media type;
- concise overview;
- genres;
- runtime or episode-length context;
- rating and rating-confidence context;
- freshness evidence;
- regional provider availability;
- trailer link;
- explanation of why the title fits.

An unsuitable recommendation can be replaced individually without restarting the decision.

### Actions

The interface distinguishes:

- `Choose tonight`;
- `Save`;
- `More like this`;
- `Not tonight`;
- `Not my taste`;
- `Already watched`;
- `Replace`.

These actions have different meanings. Watch intent is not completed viewing, a temporary rejection is not a lasting dislike, and an already-watched title is not automatically negative taste evidence.

## Optional local personalization

If the user enables personalization, PickTonight may store a first-version taste profile locally in the same browser without an account or permanent application database.

It may contain only minimal normalized signals, such as positive or negative genre preferences, media-type tendency, supported language or origin preferences, title identifiers, and explicit taste actions.

Current-session preferences always take priority over historical taste. Raw free-form preference text is not persisted.

Personalization is optional, limited to the current browser and device, and includes a complete reset action.

## Evidence status and product hypotheses

The exploratory discovery round supports the following initial direction:

- uncertainty about the desired title, genre, or mood can be part of the starting condition;
- viewers can combine several decision signals rather than follow one universal rule;
- ratings do not have equal importance in every decision;
- repetition, prolonged scrolling, and switching between sources can create friction;
- emotional and situational fit can influence confidence;
- another viewer's interest can affect a shared decision.

The following remain product hypotheses that require prototype testing:

1. Exactly three initial recommendations provide enough choice without feeling too restrictive.
2. A viewer can consistently reach a confident decision within the two-minute product promise.
3. Concise explanations increase confidence without adding excessive cognitive load.
4. Supported free-form preference text can be interpreted accurately enough to be useful and correctable.
5. Individual replacement satisfies the need for more options without recreating overload.
6. Structured feedback produces more useful evidence than a generic dislike button.
7. Available MVP data can support honest mood and tone mapping and a useful mobile information hierarchy.
8. The observed behaviors extend beyond the limited exploratory recruitment pool.

Exactly three recommendations and the under-two-minute goal remain confirmed founder requirements for the first prototype. Their inclusion does not mean discovery has validated them.

## MVP scope

The first version includes:

- a landing page explaining the product and privacy approach;
- text, tags, or both as preference-entry methods;
- editable structured interpretation of supported text;
- hard eligibility filters and explainable scoring;
- exactly three ranked recommendations when available;
- recommendation cards and title details;
- regional provider information when supported;
- trailer links when suitable normalized videos are available;
- choose, save, taste-feedback, session-rejection, already-watched, and replacement actions;
- a local watchlist;
- optional local taste personalization;
- consent-based optional product analytics;
- responsive and accessible layouts;
- loading, empty-result, timeout, retry, and honest insufficient-result states;
- required TMDB and JustWatch attribution.

## Non-goals

The MVP does not include:

- native mobile applications;
- user accounts;
- cross-device synchronization;
- a permanent application database;
- payments or subscriptions;
- video hosting or playback;
- scraping TikTok or streaming services;
- social profiles, feeds, or chat;
- sophisticated machine-learning recommendations;
- an LLM selecting titles or inventing metadata;
- complete English and Simplified Chinese localization;
- claims that PickTonight contains every title;
- claims that watch intent proves completed viewing;
- unsupported claims about virality or provider availability;
- group-preference matching before evidence supports it.

## Data and trust boundaries

TMDB is accessed through a server-only API boundary. The browser must not receive the TMDB credential.

Recommendation candidates and displayed metadata remain source-backed. The recommendation engine is deterministic and explainable.

Provider information is regional and is displayed only when supported. JustWatch attribution is required for provider data supplied through TMDB.

Low vote counts for new titles are represented as limited confidence rather than automatic evidence of low quality.

## Research status and next validation

The completed exploratory round focused on recent real behavior rather than asking participants to design or approve PickTonight. It included variation in viewing situations and decision-making behavior, but the limited recruitment pool was not statistically representative.

Raw notes remain private. The public synthesis contains only anonymized patterns, contradictions, outliers, design implications, and methodological limitations.

The next research step is to test the low-fidelity flow and then the working prototype, especially the shortest preference-to-choice path, editable interpretation, three-result constraint, information hierarchy, and individual replacement. Discovery informs the design but does not constitute market validation.

## Primary metric

The primary product metric is **qualified decision rate**:

**Recommendation sessions with confirmed watch intent ÷ recommendation sessions in which results were successfully viewed**

This measures intention, not completed viewing.

## Pilot completion signals

The initial pilot should aim for:

- at least eight people completing a real recommendation session;
- at least 25 recommendation sessions, if recruitment permits;
- at least five pieces of written feedback;
- at least five structured rejection reasons;
- one meaningful product change based on observed evidence.

These thresholds indicate completion of a credible portfolio pilot, not proof of product-market fit.
