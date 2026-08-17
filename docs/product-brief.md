# PickTonight Product Brief

- **Status:** Working draft
- **Owner:** ZK Zhao
- **Date:** August 16, 2026
- **Working title:** PickTonight
- **Detailed requirements:** [Product Requirements and Research Boundaries](./product-requirements.md)

> PickTonight is a working title only. Do not purchase a domain or invest in branding until name and trademark availability have been checked.

## Origin

PickTonight began after the founder noticed that his wife sometimes spent a long time deciding what to watch. That everyday observation motivated a broader product question: how can streaming viewers move from uncertainty to a confident choice quickly?

This is a starting observation, not a claim that every viewer has the same experience. Discovery interviews will investigate how different viewers make recent real decisions and where friction occurs.

## Problem

People can spend too much of their available viewing time browsing large catalogs instead of watching something. Existing services provide many choices, but they do not always help someone make a quick decision based on the immediate situation, including mood, time, companions, preferences, and streaming access.

## Product promise

PickTonight helps someone choose what to watch in under two minutes by returning exactly three explainable recommendations suited to the current situation.

## Product principle

> Flexible input, constrained output.

PickTonight should compete on decision quality, trust, and speed rather than trying to present the largest catalog.

## Initial target user

The initial user is an adult viewer who:

- uses at least one legal streaming service;
- sometimes has difficulty choosing a movie or television show;
- watches alone, with a partner, with friends, or with family;
- values a short relevant list more than a large catalog;
- is comfortable using a mobile or desktop web application.

## Job to be done

> When I want to watch something but do not know what to choose, help me quickly find a few options that fit my current situation so I can spend my time watching rather than browsing.

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

## Initial hypotheses

1. Immediate context such as mood, time, and provider access materially affects viewing decisions.
2. Exactly three recommendations reduce decision friction without feeling overly restrictive.
3. Clear explanations increase confidence in unfamiliar recommendations.
4. Structured feedback produces more useful evidence than a generic dislike button.
5. Individual replacement reduces the cost of correcting one unsuitable result.
6. People who frequently watch with others may value shared decision support, but that feature requires evidence before implementation.

These hypotheses remain separate from confirmed founder requirements.

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

## Research plan

Discovery interviews will include adult streaming viewers selected using the criteria in the interview guide, with variation in viewing situations and decision-making behavior where practical.

Interviews focus on recent real behavior rather than asking participants to design or approve PickTonight.

Raw notes remain private. The public synthesis will contain only anonymized patterns, contradictions, outliers, design implications, and methodological limitations. The interviews will not be used to make prevalence claims.

The interviews inform the design but do not constitute market validation.

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
