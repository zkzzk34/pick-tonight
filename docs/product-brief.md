# PickTonight Product Brief

**Status:** Working draft
**Owner:** ZK Zhao
**Date:** August 15, 2026
**Working title:** PickTonight

> PickTonight is a working title only. Do not purchase a domain or invest in branding until name and trademark availability have been checked.

## Origin and design goal

PickTonight began from a repeated household problem: the founder's wife often spends a long time deciding what to watch. She currently uses two main approaches:

* searches TikTok for fresh movie and television recommendations;
* describes her mood to ChatGPT, reviews suggested titles, and then searches for trailers before deciding.

This observation is the project's starting point, not evidence that every viewer behaves the same way. Discovery interviews will test how common these behaviors are and which parts create the most friction.

The design goal is to combine the freshness of social discovery with the flexibility of conversational input, then improve the decision with verified entertainment data, regional streaming availability, trailers, transparent explanations, and exactly three choices.

**Design principle:** flexible input, constrained output.

PickTonight should compete on decision quality, trust, and speed rather than trying to contain more titles than every entertainment platform. TikTok scraping and an LLM selecting or inventing titles remain outside the MVP. A future conversational layer may translate free-form requests into validated preferences, while the source-backed recommendation engine remains responsible for selecting titles.

## Problem

People often spend too much of their available viewing time browsing large streaming catalogs instead of watching something. Existing services provide many choices, but they do not always help users make a quick decision based on their immediate situation, including their mood, available time, viewing companions, genre preferences, and streaming access.

## Product promise

PickTonight helps someone choose something to watch in under two minutes by returning exactly three explainable recommendations suited to their current situation.

## Initial target user

The initial user is an adult viewer who:

* subscribes to at least one streaming service;
* sometimes experiences decision fatigue when choosing a movie or television show;
* watches alone, with a partner, with friends, or with family;
* values a short, relevant list more than a large catalog;
* is comfortable using a mobile or desktop web application.

## Job to be done

> When I want to watch something but do not know what to choose, help me quickly find a few options that fit my mood, time, company, and streaming access so I can spend my time watching rather than browsing.

## Proposed experience

The user answers a short series of questions about:

* movie, television, or either;
* current mood;
* available time;
* viewing companions;
* preferred and excluded genres;
* country or region;
* available streaming services.

PickTonight returns three ranked recommendations. Each recommendation explains why it fits the supplied preferences. The user can view details, confirm watch intent, save the title, reject it with a structured reason, or request another option.

The product records watch intent, not whether the user actually watched the title.

## Initial hypotheses

1. Recommendations that incorporate mood, time, and streaming access will feel more relevant than generic popular-title recommendations.
2. Limiting the result to three choices will reduce decision friction without feeling overly restrictive.
3. Clear explanations will increase trust and willingness to explore or select a recommendation.
4. Structured rejection reasons will produce more actionable product evidence than a generic dislike button.
5. People who frequently watch with partners or friends will express interest in a shared decision-making mode, but that feature should be validated before it is built.

## MVP scope

The first version must include:

* a landing page explaining the product and its privacy approach;
* a short preference flow;
* three ranked and explainable recommendations;
* title details and regional provider information when available;
* choose, save, reject, replace, and feedback actions;
* consent-based anonymous product analytics;
* responsive and accessible layouts;
* graceful loading, empty-result, and error states;
* required entertainment-data attribution.

## Non-goals

The MVP will not include:

* native mobile applications;
* user accounts or a permanent application database;
* payments or subscriptions;
* video hosting or playback;
* scraping streaming services;
* social profiles, feeds, or chat;
* machine-learning or collaborative-filtering recommendations;
* an LLM selecting titles or inventing title information;
* claims that watch intent proves a title was actually watched;
* group-preference matching before user research validates the need.

## Primary metric

The primary product metric is **qualified decision rate**:

**Recommendation sessions with confirmed watch intent ÷ recommendation sessions in which results were successfully viewed**

This measures intention, not completed viewing.

## Pilot completion signals

The initial pilot should aim for:

* at least eight people completing a real recommendation session;
* at least 25 recommendation sessions, if recruitment permits;
* at least five pieces of written feedback;
* at least five structured rejection reasons;
* one meaningful product change based on observed evidence.

These thresholds indicate completion of a credible portfolio pilot, not proof of product-market fit.
