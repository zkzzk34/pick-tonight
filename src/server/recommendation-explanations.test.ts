import assert from "node:assert/strict";
import test from "node:test";

import {
  recommendationExplanationSchema,
  type RecommendationExplanation,
  type RecommendationRequest,
} from "../shared/recommendation-contracts.ts";

import {
  RECOMMENDATION_HEURISTIC_VERSION,
  type RecommendationScoreBreakdown,
} from "./recommendation-engine.ts";
import { generateRecommendationExplanation } from "./recommendation-explanations.ts";
import type { TmdbHardRestrictionEvidence } from "./tmdb-discovery-candidates.ts";

const noHardRestrictionEvidence: TmdbHardRestrictionEvidence = {
  maximumRuntimeMinutes: null,
  providerRestriction: null,
};

function baseScore(): RecommendationScoreBreakdown {
  return {
    version: RECOMMENDATION_HEURISTIC_VERSION,
    preferredGenres: {
      requestedGenreIds: [],
      matchedGenreIds: [],
      points: 0,
    },
    mood: {
      requestedMood: null,
      matchedGenreIds: [],
      discoverySignals: [],
      points: 0,
    },
    contentLanguage: {
      requestedLanguage: null,
      actualLanguage: null,
      matched: false,
      points: 0,
    },
    rating: {
      voteAverage: null,
      voteCount: null,
      ageState: "unknown",
      meaningfulEvidence: false,
      confidenceState: "limited",
      confidenceFactor: 0,
      points: 0,
    },
    releaseContext: {
      releaseYear: null,
      points: 0,
    },
    total: 0,
  };
}

function scoreWith(
  overrides: Partial<RecommendationScoreBreakdown>,
): RecommendationScoreBreakdown {
  return {
    ...baseScore(),
    ...overrides,
  };
}

function explain(
  request: RecommendationRequest = {},
  score: RecommendationScoreBreakdown = baseScore(),
  hardRestrictionEvidence: TmdbHardRestrictionEvidence = noHardRestrictionEvidence,
): RecommendationExplanation {
  return generateRecommendationExplanation({
    request,
    score,
    hardRestrictionEvidence,
  });
}

test("emits verified provider and runtime reasons from exact query evidence", () => {
  const explanation = explain(
    {
      hardRestrictions: {
        maximumRuntimeMinutes: 120,
        requiredProviderIds: [8, 337],
      },
      watchRegion: "US",
    },
    baseScore(),
    {
      maximumRuntimeMinutes: 120,
      providerRestriction: {
        watchRegion: "US",
        requiredProviderIds: [337, 8],
      },
    },
  );

  assert.deepEqual(explanation, {
    summary: "This title stands out for the reasons below.",
    reasons: [
      {
        kind: "verified-constraint",
        code: "provider-availability",
        text: "Available through your selected streaming options in your chosen region.",
      },
      {
        kind: "verified-constraint",
        code: "runtime-within-limit",
        text: "Fits within your 120-minute runtime limit.",
      },
    ],
  });
  assert.equal(
    recommendationExplanationSchema.safeParse(explanation).success,
    true,
  );
});

test("orders soft matches by genre, mood, freshness, language, then rating", () => {
  const explanation = explain(
    {
      softPreferences: {
        preferredGenreIds: [35, 18],
        mood: "relaxed",
        freshness: {
          releasedSinceYear: 2020,
        },
        contentLanguage: "en",
      },
    },
    scoreWith({
      preferredGenres: {
        requestedGenreIds: [35, 18],
        matchedGenreIds: [18, 35],
        points: 60,
      },
      mood: {
        requestedMood: "relaxed",
        matchedGenreIds: [35],
        discoverySignals: [],
        points: 18,
      },
      contentLanguage: {
        requestedLanguage: "en",
        actualLanguage: "en",
        matched: true,
        points: 12,
      },
      rating: {
        voteAverage: 8,
        voteCount: 800,
        ageState: "unknown",
        meaningfulEvidence: true,
        confidenceState: "strong",
        confidenceFactor: 1,
        points: 16,
      },
      releaseContext: {
        releaseYear: 2024,
        points: 0,
      },
      total: 106,
    }),
  );

  assert.deepEqual(explanation.reasons, [
    {
      kind: "soft-match",
      code: "preferred-genre-match",
      text: "Matches multiple preferred genres.",
    },
    {
      kind: "soft-match",
      code: "mood-match",
      text: "Fits the relaxed mood you chose.",
    },
  ]);
});

test("uses one verified reason and one soft reason when both kinds exist", () => {
  const explanation = explain(
    {
      hardRestrictions: {
        maximumRuntimeMinutes: 100,
      },
      softPreferences: {
        preferredGenreIds: [35],
        mood: "relaxed",
      },
    },
    scoreWith({
      preferredGenres: {
        requestedGenreIds: [35],
        matchedGenreIds: [35],
        points: 30,
      },
      mood: {
        requestedMood: "relaxed",
        matchedGenreIds: [35],
        discoverySignals: [],
        points: 18,
      },
      total: 48,
    }),
    {
      maximumRuntimeMinutes: 100,
      providerRestriction: null,
    },
  );

  assert.deepEqual(
    explanation.reasons.map(({ kind, code }) => ({ kind, code })),
    [
      {
        kind: "verified-constraint",
        code: "runtime-within-limit",
      },
      {
        kind: "soft-match",
        code: "preferred-genre-match",
      },
    ],
  );
});

test("emits freshness only for an explicit satisfied cutoff", () => {
  const matchingScore = scoreWith({
    releaseContext: {
      releaseYear: 2024,
      points: 0,
    },
  });
  const freshnessRequest: RecommendationRequest = {
    softPreferences: {
      freshness: {
        releasedSinceYear: 2020,
      },
    },
  };

  assert.deepEqual(explain(freshnessRequest, matchingScore).reasons, [
    {
      kind: "soft-match",
      code: "freshness-match",
      text: "Released in 2024, matching your requested release window.",
    },
  ]);

  assert.deepEqual(explain({}, matchingScore).reasons, []);

  assert.deepEqual(
    explain(
      freshnessRequest,
      scoreWith({
        releaseContext: {
          releaseYear: 2019,
          points: 0,
        },
      }),
    ).reasons,
    [],
  );

  assert.deepEqual(
    explain(
      freshnessRequest,
      scoreWith({
        releaseContext: {
          releaseYear: null,
          points: 0,
        },
      }),
    ).reasons,
    [],
  );
});

test("does not claim regional provider availability without matching evidence", () => {
  const request: RecommendationRequest = {
    hardRestrictions: {
      requiredProviderIds: [8],
    },
    watchRegion: "US",
  };

  assert.deepEqual(explain(request).reasons, []);

  assert.deepEqual(
    explain(request, baseScore(), {
      maximumRuntimeMinutes: null,
      providerRestriction: {
        watchRegion: "CA",
        requiredProviderIds: [8],
      },
    }).reasons,
    [],
  );

  assert.deepEqual(
    explain(request, baseScore(), {
      maximumRuntimeMinutes: null,
      providerRestriction: {
        watchRegion: "US",
        requiredProviderIds: [337],
      },
    }).reasons,
    [],
  );
});

test("supports language and qualifying rating-confidence evidence", () => {
  const explanation = explain(
    {
      softPreferences: {
        contentLanguage: "en",
      },
    },
    scoreWith({
      contentLanguage: {
        requestedLanguage: "en",
        actualLanguage: "en",
        matched: true,
        points: 12,
      },
      rating: {
        voteAverage: 7.6,
        voteCount: 200,
        ageState: "established",
        meaningfulEvidence: true,
        confidenceState: "medium",
        confidenceFactor: 0.75,
        points: 11,
      },
      total: 23,
    }),
  );

  assert.deepEqual(explanation.reasons, [
    {
      kind: "soft-match",
      code: "content-language-match",
      text: "Matches your preferred content language.",
    },
    {
      kind: "soft-match",
      code: "rating-confidence",
      text: "Its viewer rating is supported by substantial feedback.",
    },
  ]);
});

test("requires meaningful rating evidence and at least 100 votes", () => {
  const belowThreshold = explain(
    {},
    scoreWith({
      rating: {
        voteAverage: 8,
        voteCount: 99,
        ageState: "unknown",
        meaningfulEvidence: true,
        confidenceState: "medium",
        confidenceFactor: 0.5,
        points: 8,
      },
      total: 8,
    }),
  );

  const atThreshold = explain(
    {},
    scoreWith({
      rating: {
        voteAverage: 8,
        voteCount: 100,
        ageState: "established",
        meaningfulEvidence: true,
        confidenceState: "medium",
        confidenceFactor: 0.75,
        points: 12,
      },
      total: 12,
    }),
  );

  const high = explain(
    {},
    scoreWith({
      rating: {
        voteAverage: 8,
        voteCount: 500,
        ageState: "unknown",
        meaningfulEvidence: true,
        confidenceState: "strong",
        confidenceFactor: 1,
        points: 16,
      },
      total: 16,
    }),
  );

  assert.deepEqual(belowThreshold.reasons, []);
  assert.equal(atThreshold.reasons[0]?.code, "rating-confidence");
  assert.equal(
    atThreshold.reasons[0]?.text,
    "Its viewer rating is supported by substantial feedback.",
  );
  assert.equal(high.reasons[0]?.code, "rating-confidence");
  assert.equal(
    high.reasons[0]?.text,
    "Its viewer rating is supported by extensive feedback.",
  );
});

test("keeps missing and sparse evidence neutral and output deterministic", () => {
  const sparseScore = scoreWith({
    mood: {
      requestedMood: "surprised",
      matchedGenreIds: [],
      discoverySignals: ["cross-genre-variety"],
      points: 0,
    },
    rating: {
      voteAverage: 9,
      voteCount: 12,
      ageState: "unknown",
      meaningfulEvidence: true,
      confidenceState: "limited",
      confidenceFactor: 0.25,
      points: 5,
    },
    total: 5,
  });
  const request: RecommendationRequest = {
    softPreferences: {
      mood: "surprised",
    },
  };

  const first = explain(request, sparseScore);
  const second = explain(request, sparseScore);

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    summary:
      "This title is recommended from the information currently available.",
    reasons: [],
  });

  const serialized = JSON.stringify(first);
  assert.equal(
    /(accuracy|internal|points|weight|tiktok|viral|poor quality)/i.test(
      serialized,
    ),
    false,
  );
});
