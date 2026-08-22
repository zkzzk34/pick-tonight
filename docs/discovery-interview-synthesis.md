# Discovery interview synthesis

Status: Exploratory round synthesized

Prompt version: `streaming-choice-interview-v1`

Date: August 22, 2026

Related issue: [#3 — Conduct and synthesize discovery interviews](https://github.com/zkzzk34/pick-tonight/issues/3)

## Purpose and scope

This round explored how adult streaming viewers move from wanting to watch something to selecting, beginning, postponing, or abandoning a title. The evidence covered different situations, including spontaneous shared evening viewing, browsing within a limited period, and looking for a new series after finishing another one.

The round was intended to expose behaviors, decision signals, friction, contradictions, and questions for the first PickTonight design. It was not intended to estimate prevalence, represent a market, validate product demand, or prove that a proposed feature will work.

## Method and evidence handling

Participants completed ChatGPT-mediated qualitative interviews using the same prompt version. The analysis grouped de-identified observations by decision trigger, discovery source, evaluation signal, rejection behavior, confidence, and abandonment or fallback behavior.

Raw handoffs remain private and are not part of this repository. This synthesis excludes names, contact information, recruitment relationships, private links, title-specific details that were not needed for a finding, and all raw answer text. No participant quotation is included.

Some exported handoffs had incomplete protocol, transfer-boundary, or participant-review metadata. Those gaps are retained as methodological limitations rather than silently inferred or repaired. A participant-confirmed summary with incomplete protocol metadata was used only as provisional context and not as evidence for eligibility or quotation permission.

## Recurring observations

### The decision can begin before the viewer can state a precise preference

Viewers described wanting to watch something while still being uncertain about the exact genre, mood, or title they wanted. Preferences sometimes became clearer only after a poster, synopsis, trailer, cast, or recommendation produced a reaction.

This supports allowing a broad starting point and showing an editable interpretation rather than requiring a complete filter form before recommendations appear.

### Confidence comes from a combination of signals

No single information source consistently explained a choice. Signals included posters, cast, synopsis, trailer, emotional tone, storyline, runtime, ratings, reviews, and whether another viewer was interested. Familiar or trusted cast members could create confidence quickly or compensate for weaker information elsewhere.

The first design should make the reason for each recommendation visible while keeping additional evidence available without overcrowding the initial result.

### Ratings are useful to some viewers but are not a universal decision rule

Ratings encouraged closer investigation in some decisions, while another account gave them little weight compared with tone, cast, trailer, and description. A weak rating could also be outweighed by an appealing cast or synopsis.

Ratings may be displayed as one contextual signal, but the product should not imply that a rating alone determines personal fit or recommendation order.

### Discovery can become repetitive and fragmented across sources

Viewers described beginning on a streaming platform and sometimes moving to social media, general search, or an AI assistant when platform options felt repetitive, too broad, or insufficiently personalized. External searching was also used to verify specific details after a candidate had already attracted interest.

PickTonight can reduce this switching cost by presenting a small varied set, a concise explanation, and direct access to useful details such as a trailer and provider availability.

### Optionality helps recognition but can also create overload

One behavior favored having many recommendations available for comparison, yet prolonged comparison and repeated options could also create boredom, overwhelm, or abandonment. Another account described ending the search when continued scrolling failed to produce an interesting title.

This tension supports exactly three initial recommendations combined with `Replace` and `More like this`, rather than either a single irreversible answer or an infinite initial list.

### Emotional fit matters in the present situation

Decisions were influenced by desired energy, chemistry, emotional intensity, positive development, entertainment value, and uncertainty about whether a story would end happily or sadly. These signals were contextual rather than fixed genre rules.

The design may test optional mood and tone preferences, but it must not promise a particular emotional outcome or ending unless the underlying data can support that claim honestly.

### Another viewer can affect the final commitment

In a shared decision, a strong candidate still needed to interest the other viewer. Showing a trailer helped obtain agreement, and disagreement caused the search to continue.

This supports making recommendation details easy to show or share. The evidence does not yet justify multi-person profiles, voting, or group matching in the MVP.

## Contradictions and tensions

- More recommendations can help a viewer recognize what stands out, while extended browsing can also cause overload and abandonment.
- Ratings can increase confidence for one decision and matter very little in another.
- A viewer may trust platform personalization but still leave the platform to find variety or verify a specific uncertainty.
- A viewer may begin with a genre or mood in mind but change direction when an unexpected title feels more compelling.
- A long search can produce confidence in the eventual choice, even though the effort required to reach that confidence is itself a problem.

These tensions argue for flexible evidence and progressive disclosure rather than a rigid questionnaire, rating-only ranking, or unlimited result feed.

## Context-specific and outlying observations

The following observations are useful design questions but are not treated as recurring requirements:

- A viewer may stop the viewing attempt and switch to another activity instead of choosing a familiar fallback.
- A viewer may search elsewhere specifically to resolve uncertainty about the emotional outcome of a story.
- An AI assistant may enter the journey only after platform browsing and social recommendations fail to produce a satisfactory option.
- A viewer may continue browsing after finding an appealing title and later return because that earlier title remained memorable.
- Companion approval may act as a veto in a shared viewing situation.

## Design implications for the first product flow

| Evidence | Initial design response | Status |
| --- | --- | --- |
| Preferences can begin vague and become clearer through exposure | Allow free-form words, optional tags, or both; show an editable structured interpretation | Retain and test |
| Several signals contribute to confidence | Explain why each title fits and provide poster, synopsis, cast, runtime, rating context, trailer, and provider details through progressive disclosure | Retain and test hierarchy |
| Ratings have inconsistent importance | Display ratings as supporting evidence without making them the sole definition of fit | Retain |
| Viewers want variety but can become overloaded | Show exactly three initial recommendations and allow one-at-a-time replacement | Retain and test |
| Mood and emotional fit affect the decision | Offer optional mood or tone input without guaranteeing an ending or unsupported emotional classification | Test carefully |
| Repetitive cross-source browsing adds friction | Avoid duplicate-feeling results and provide useful verification paths from one place | Retain and test |
| Shared viewing may require quick agreement | Make trailers and core details easy to show; defer group accounts, voting, and synchronized profiles | Limited support; defer expansion |

## Supported findings and unresolved assumptions

### Supported by this round

- Uncertainty about the desired title, genre, or mood can be part of the starting condition.
- Viewers can combine several forms of evidence rather than follow one universal decision rule.
- Ratings do not have the same importance in every decision.
- Repetition, prolonged scrolling, and source switching can create decision friction.
- A viewing attempt can end without a title being selected.
- Mood, emotional tone, cast, synopsis, and trailer information can influence confidence.

### Still assumptions to test

- Exactly three initial recommendations provide enough choice for the intended audience.
- Individual replacement satisfies viewers who want additional options without recreating overload.
- A viewer can reach a confident choice within the two-minute product promise.
- Short explanations increase confidence rather than add cognitive load.
- Free-form language can be interpreted accurately enough to be useful and correctable.
- Mood and tone can be mapped honestly from the data available to the MVP.
- Rating, cast, trailer, runtime, and provider information can be arranged without overcrowding a mobile result card.
- Companion-oriented functions beyond showing or sharing details would create sufficient value for the MVP.
- The observed behaviors extend to viewers outside this recruitment pool and to a broader range of accessibility needs, languages, regions, providers, and viewing contexts.

## Methodological limitations

- This was a small exploratory convenience sample with limited recruitment diversity.
- The evidence is not statistically representative and cannot support prevalence, market-size, or validation claims.
- Handoffs varied substantially in depth, so a more detailed account could contribute more observations than a shorter one.
- Some handoffs had incomplete protocol, closing-boundary, input-method, or participant-review metadata.
- A handoff awaiting participant review was not used for public quotations.
- A participant-confirmed summary without the complete exported protocol record was treated as provisional context and was not used for quotations or eligibility claims.
- The accounts were retrospective and were not verified through direct observation or screen recordings.
- Reported decision times were approximate and should not be treated as measured performance.
- Some topics, including accessibility, saving behavior, companion behavior, unfamiliar titles, language, region, and provider constraints, were absent or unevenly covered.
- The round did not test a PickTonight prototype, recommendation quality, data availability, willingness to return, or the two-minute promise.

## Next actions

1. Use these findings to update the behavior-based target persona and job to be done in issue #4.
2. Convert supported findings and unresolved assumptions into a low-fidelity mobile flow for issue #6.
3. Test the shortest preference-to-choice path, editable interpretation, three-result constraint, information hierarchy, and individual replacement with likely users.
4. Recruit future research from a broader range of viewing situations and access needs.
5. Revise the findings and design when prototype evidence contradicts this exploratory synthesis.
