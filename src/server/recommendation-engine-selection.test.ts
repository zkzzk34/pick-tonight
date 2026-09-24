import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";
import {
  RATING_CONFIDENCE_CONFIG,
  GENRE_DIVERSITY_MINIMUM_NEW_GENRES,
  RECOMMENDATION_LIMIT,
  TEMPORAL_COHESION_MAX_YEAR_GAP,
  TEMPORAL_COHESION_SCORE_WINDOW,
  selectRecommendations,
  scoreRecommendationCandidate,
} from "./recommendation-engine.ts";
import type {
  TmdbDiscoveryCandidate,
  TmdbHardRestrictionEvidence,
  TmdbDiscoverySource,
} from "./tmdb-discovery-candidates.ts";

function movie(
  id: number,
  overrides: Partial<MediaSummary> = {},
): MediaSummary {
  return {
    source: "tmdb",
    mediaType: "movie",
    id,
    title: overrides.title ?? `Movie ${id}`,
    originalTitle: null,
    overview: null,
    releaseDate: null,
    originalLanguage: "en",
    genreIds: [],
    posterPath: null,
    backdropPath: null,
    popularity: null,
    voteAverage: null,
    voteCount: null,
    adult: false,
    ...overrides,
  };
}

function candidate(
  media: MediaSummary,
  sources: readonly TmdbDiscoverySource[] = ["discover-movie"],
  hardRestrictionEvidence: TmdbHardRestrictionEvidence = {
    maximumRuntimeMinutes: null,
    providerRestriction: null,
  },
): TmdbDiscoveryCandidate {
  return {
    media,
    sources,
    hardRestrictionEvidence,
  };
}

function selectedKeys(
  candidates: readonly TmdbDiscoveryCandidate[],
  request: RecommendationRequest = {},
): string[] {
  return selectRecommendations(candidates, request).recommendations.map(
    ({ candidate: selected }) =>
      `${selected.media.mediaType}:${selected.media.id}`,
  );
}

test("returns an honest limited result for zero eligible candidates", () => {
  const result = selectRecommendations([], {});

  assert.deepEqual(result, {
    status: "limited",
    requestedCount: RECOMMENDATION_LIMIT,
    eligibleCount: 0,
    recommendations: [],
  });
});

test("returns the sole eligible candidate in an honest limited result", () => {
  const result = selectRecommendations([candidate(movie(1))], {});

  assert.equal(result.status, "limited");
  assert.equal(result.requestedCount, RECOMMENDATION_LIMIT);
  assert.equal(result.eligibleCount, 1);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [1],
  );
});

test("attaches a structured explanation to each selected recommendation", () => {
  const result = selectRecommendations(
    [candidate(movie(901, { genreIds: [35] }))],
    { softPreferences: { preferredGenreIds: [35] } },
  );
  const explanation = result.recommendations[0]?.explanation;

  assert.ok(explanation);
  assert.equal(
    explanation.summary,
    "This title stands out for the reasons below.",
  );
  assert.deepEqual(
    explanation.reasons.map(({ kind, code }) => ({ kind, code })),
    [{ kind: "soft-match", code: "preferred-genre-match" }],
  );
});

test("does not score release year, popularity, or discovery source", () => {
  const classic = candidate(
    movie(1, {
      releaseDate: "1932-04-09",
      popularity: 0,
    }),
    ["discover-movie"],
  );
  const current = candidate(
    movie(2, {
      releaseDate: "2026-04-09",
      popularity: 999,
    }),
    ["trending-movie-week"],
  );

  const classicScore = scoreRecommendationCandidate(classic, {});
  const currentScore = scoreRecommendationCandidate(current, {});

  assert.equal(classicScore.total, currentScore.total);
  assert.deepEqual(classicScore.releaseContext, {
    releaseYear: 1932,
    points: 0,
  });
  assert.deepEqual(currentScore.releaseContext, {
    releaseYear: 2026,
    points: 0,
  });
  assert.deepEqual(selectedKeys([current, classic]), ["movie:1", "movie:2"]);
  assert.deepEqual(selectedKeys([classic, current]), ["movie:1", "movie:2"]);
});

test("uses media type then TMDB ID as stable final tie breakers", () => {
  const tiedCandidates = [
    candidate(movie(2, { mediaType: "tv", title: "Television 2" }), [
      "discover-tv",
    ]),
    candidate(movie(20)),
    candidate(movie(1, { mediaType: "tv", title: "Television 1" }), [
      "discover-tv",
    ]),
    candidate(movie(10)),
  ];
  const request: RecommendationRequest = {
    hardRestrictions: { mediaType: "either" },
  };
  const expectedKeys = ["movie:10", "movie:20", "tv:1"];

  assert.deepEqual(selectedKeys(tiedCandidates, request), expectedKeys);
  assert.deepEqual(
    selectedKeys([...tiedCandidates].reverse(), request),
    expectedKeys,
  );
});

test("excludes active-session titles and reports complete or limited results", () => {
  const candidates = [1, 2, 3, 4, 5].map((id) => candidate(movie(id)));
  candidates.push(candidates[2]!);

  const sessionExclusions = {
    shown: [{ mediaType: "movie", id: 1 }] as const,
    removed: [{ mediaType: "movie", id: 2 }] as const,
  };
  const complete = selectRecommendations(candidates, {}, sessionExclusions);

  assert.equal(complete.status, "complete");
  assert.equal(complete.requestedCount, RECOMMENDATION_LIMIT);
  assert.equal(complete.eligibleCount, 3);
  assert.deepEqual(
    complete.recommendations.map(
      ({ candidate: selected }) => selected.media.id,
    ),
    [3, 4, 5],
  );

  const limited = selectRecommendations(
    candidates.filter(({ media }) => media.id <= 4),
    {},
    sessionExclusions,
  );

  assert.equal(limited.status, "limited");
  assert.equal(limited.requestedCount, RECOMMENDATION_LIMIT);
  assert.equal(limited.eligibleCount, 2);
  assert.deepEqual(
    limited.recommendations.map(({ candidate: selected }) => selected.media.id),
    [3, 4],
  );
});

test("separates rating value from confidence and keeps sparse votes uncertain", () => {
  const asOfDate = "2026-09-14";

  const expectations = [
    {
      voteCount: null,
      confidenceState: "limited",
      confidenceFactor: 0,
      meaningfulEvidence: false,
      points: 0,
    },
    {
      voteCount: 0,
      confidenceState: "limited",
      confidenceFactor: 0,
      meaningfulEvidence: false,
      points: 0,
    },
    {
      voteCount: 1,
      confidenceState: "limited",
      confidenceFactor: 0.25,
      meaningfulEvidence: true,
      points: 4,
    },
    {
      voteCount: 25,
      confidenceState: "medium",
      confidenceFactor: 0.5,
      meaningfulEvidence: true,
      points: 8,
    },
    {
      voteCount: 100,
      confidenceState: "medium",
      confidenceFactor: 0.75,
      meaningfulEvidence: true,
      points: 12,
    },
    {
      voteCount: 500,
      confidenceState: "strong",
      confidenceFactor: 1,
      meaningfulEvidence: true,
      points: 16,
    },
  ] as const;

  for (const [index, expectedRating] of expectations.entries()) {
    const { voteCount, ...expectedConfidence } = expectedRating;

    const score = scoreRecommendationCandidate(
      candidate(
        movie(100 + index, {
          releaseDate: "2025-01-01",
          voteAverage: 8,
          voteCount,
        }),
      ),
      {},
      { asOfDate },
    );

    assert.deepEqual(score.rating, {
      voteAverage: 8,
      voteCount,
      ageState: "established",
      ...expectedConfidence,
    });
  }

  const missingValue = scoreRecommendationCandidate(
    candidate(
      movie(200, {
        releaseDate: "2025-01-01",
        voteAverage: null,
        voteCount: 500,
      }),
    ),
    {},
    { asOfDate },
  );

  assert.deepEqual(missingValue.rating, {
    voteAverage: null,
    voteCount: 500,
    ageState: "established",
    meaningfulEvidence: false,
    confidenceState: "limited",
    confidenceFactor: 0,
    points: 0,
  });
});

test("uses age-aware confidence without rejecting sparse recent titles", () => {
  const asOfDate = "2026-09-14";

  assert.equal(RATING_CONFIDENCE_CONFIG.recentTitleWindowDays, 180);

  const recent = scoreRecommendationCandidate(
    candidate(
      movie(210, {
        releaseDate: "2026-08-01",
        voteAverage: 8,
        voteCount: 100,
      }),
    ),
    {},
    { asOfDate },
  );

  const established = scoreRecommendationCandidate(
    candidate(
      movie(211, {
        releaseDate: "2025-01-01",
        voteAverage: 8,
        voteCount: 100,
      }),
    ),
    {},
    { asOfDate },
  );

  const recentBoundary = scoreRecommendationCandidate(
    candidate(
      movie(212, {
        releaseDate: "2026-03-18",
        voteAverage: 8,
        voteCount: 100,
      }),
    ),
    {},
    { asOfDate },
  );

  const establishedBoundary = scoreRecommendationCandidate(
    candidate(
      movie(213, {
        releaseDate: "2026-03-17",
        voteAverage: 8,
        voteCount: 100,
      }),
    ),
    {},
    { asOfDate },
  );

  const sparseRecentCandidate = candidate(
    movie(214, {
      releaseDate: "2026-09-01",
      voteAverage: 8,
      voteCount: 1,
    }),
  );

  const sparseRecent = scoreRecommendationCandidate(
    sparseRecentCandidate,
    {},
    { asOfDate },
  );

  const zeroVoteRecent = scoreRecommendationCandidate(
    candidate(
      movie(215, {
        releaseDate: "2026-09-01",
        voteAverage: 8,
        voteCount: 0,
      }),
    ),
    {},
    { asOfDate },
  );

  const unknownAge = scoreRecommendationCandidate(
    candidate(
      movie(216, {
        releaseDate: null,
        voteAverage: 8,
        voteCount: 100,
      }),
    ),
    {},
    { asOfDate },
  );

  assert.deepEqual(recent.rating, {
    voteAverage: 8,
    voteCount: 100,
    ageState: "recent",
    meaningfulEvidence: true,
    confidenceState: "strong",
    confidenceFactor: 1,
    points: 16,
  });

  assert.deepEqual(established.rating, {
    voteAverage: 8,
    voteCount: 100,
    ageState: "established",
    meaningfulEvidence: true,
    confidenceState: "medium",
    confidenceFactor: 0.75,
    points: 12,
  });

  assert.equal(recentBoundary.rating.ageState, "recent");
  assert.equal(recentBoundary.rating.confidenceState, "strong");

  assert.equal(establishedBoundary.rating.ageState, "established");
  assert.equal(establishedBoundary.rating.confidenceState, "medium");

  assert.deepEqual(sparseRecent.rating, {
    voteAverage: 8,
    voteCount: 1,
    ageState: "recent",
    meaningfulEvidence: true,
    confidenceState: "limited",
    confidenceFactor: 0.25,
    points: 4,
  });

  assert.deepEqual(zeroVoteRecent.rating, {
    voteAverage: 8,
    voteCount: 0,
    ageState: "recent",
    meaningfulEvidence: false,
    confidenceState: "limited",
    confidenceFactor: 0,
    points: 0,
  });

  assert.equal(unknownAge.rating.ageState, "unknown");
  assert.equal(unknownAge.rating.confidenceState, "medium");
  assert.equal(unknownAge.rating.confidenceFactor, 0.75);

  const selection = selectRecommendations(
    [sparseRecentCandidate],
    {},
    {},
    { asOfDate },
  );

  assert.equal(selection.status, "limited");
  assert.equal(selection.eligibleCount, 1);
  assert.equal(selection.recommendations[0]?.candidate.media.id, 214);
  assert.equal(
    selection.recommendations[0]?.score.rating.confidenceState,
    "limited",
  );
});

test("filters hard failures before selecting from the ranked pool", () => {
  const verifiedEvidence: TmdbHardRestrictionEvidence = {
    maximumRuntimeMinutes: 120,
    providerRestriction: {
      watchRegion: "US",
      requiredProviderIds: [8],
    },
  };
  const excludedHighScore = candidate(
    movie(1, {
      genreIds: [27, 35],
      voteAverage: 10,
      voteCount: 500,
    }),
    ["discover-movie"],
    verifiedEvidence,
  );
  const unverifiedHighScore = candidate(
    movie(2, {
      genreIds: [35],
      voteAverage: 10,
      voteCount: 500,
    }),
  );
  const eligibleLowScore = candidate(
    movie(3),
    ["discover-movie"],
    verifiedEvidence,
  );

  const result = selectRecommendations(
    [excludedHighScore, unverifiedHighScore, eligibleLowScore],
    {
      hardRestrictions: {
        mediaType: "movie",
        excludedGenreIds: [27],
        maximumRuntimeMinutes: 120,
        requiredProviderIds: [8],
      },
      softPreferences: { preferredGenreIds: [35] },
      watchRegion: "US",
    },
  );

  assert.equal(result.status, "limited");
  assert.equal(result.eligibleCount, 1);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [3],
  );
  assert.equal(result.recommendations[0]?.score.total, 0);
});

test("avoids extreme year jumps only among comparably fitting titles", () => {
  const result = selectRecommendations(
    [
      candidate(movie(1, { releaseDate: "2026-01-01" })),
      candidate(movie(2, { releaseDate: "1932-01-01" })),
      candidate(movie(3, { releaseDate: null })),
      candidate(movie(4, { releaseDate: "1984-01-01" })),
    ],
    {},
  );

  assert.equal(TEMPORAL_COHESION_MAX_YEAR_GAP, 50);
  assert.equal(TEMPORAL_COHESION_SCORE_WINDOW, 5);
  assert.equal(result.status, "complete");
  assert.equal(result.eligibleCount, 4);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [1, 3, 4],
  );
  assert.deepEqual(
    result.recommendations.map(
      ({ selectionEvidence }) => selectionEvidence.temporalCohesion,
    ),
    [
      {
        applied: false,
        anchorReleaseYear: 2026,
        candidateReleaseYear: 2026,
        yearGap: 0,
        classification: "within-range",
        affectedSelection: false,
      },
      {
        applied: true,
        anchorReleaseYear: 2026,
        candidateReleaseYear: null,
        yearGap: null,
        classification: "unknown",
        affectedSelection: true,
      },
      {
        applied: true,
        anchorReleaseYear: 2026,
        candidateReleaseYear: 1984,
        yearGap: 42,
        classification: "within-range",
        affectedSelection: true,
      },
    ],
  );
});

test("keeps older titles eligible when stronger or alternatives run out", () => {
  const fallback = selectRecommendations(
    [
      candidate(movie(1, { releaseDate: "2026-01-01" })),
      candidate(movie(2, { releaseDate: "1932-01-01" })),
    ],
    {},
  );

  assert.equal(fallback.status, "limited");
  assert.equal(fallback.eligibleCount, 2);
  assert.deepEqual(
    fallback.recommendations.map(
      ({ candidate: selected }) => selected.media.id,
    ),
    [1, 2],
  );
  assert.deepEqual(
    fallback.recommendations[1]?.selectionEvidence.temporalCohesion,
    {
      applied: true,
      anchorReleaseYear: 2026,
      candidateReleaseYear: 1932,
      yearGap: 94,
      classification: "extreme-gap",
      affectedSelection: false,
    },
  );

  const stronger = selectRecommendations(
    [
      candidate(
        movie(10, {
          releaseDate: "2026-01-01",
          genreIds: [35, 18],
        }),
      ),
      candidate(
        movie(20, {
          releaseDate: "1932-01-01",
          genreIds: [35],
        }),
      ),
      candidate(
        movie(30, {
          releaseDate: "1984-01-01",
          voteAverage: 10,
          voteCount: 500,
        }),
      ),
    ],
    {
      softPreferences: {
        preferredGenreIds: [35, 18],
      },
    },
  );

  assert.deepEqual(
    stronger.recommendations.map(
      ({ candidate: selected }) => selected.media.id,
    ),
    [10, 20, 30],
  );
  assert.equal(stronger.recommendations[1]?.score.total, 30);
  assert.equal(stronger.recommendations[2]?.score.total, 20);
  assert.ok(
    (stronger.recommendations[1]?.score.total ?? Number.NEGATIVE_INFINITY) -
      (stronger.recommendations[2]?.score.total ?? Number.POSITIVE_INFINITY) >
      TEMPORAL_COHESION_SCORE_WINDOW,
  );
  assert.equal(
    stronger.recommendations[1]?.selectionEvidence.temporalCohesion
      .classification,
    "extreme-gap",
  );
});

test("uses stronger current-session evidence when total scores tie", () => {
  const moodAndRating = candidate(
    movie(1, {
      genreIds: [16],
      voteAverage: 8,
      voteCount: 100,
    }),
  );
  const preferredGenre = candidate(
    movie(2, {
      genreIds: [27],
    }),
  );
  const request = {
    softPreferences: {
      mood: "relaxed" as const,
      preferredGenreIds: [27],
    },
  };

  const moodAndRatingScore = scoreRecommendationCandidate(
    moodAndRating,
    request,
  );
  const preferredGenreScore = scoreRecommendationCandidate(
    preferredGenre,
    request,
  );

  assert.equal(moodAndRatingScore.total, 30);
  assert.equal(moodAndRatingScore.mood.points, 18);
  assert.equal(moodAndRatingScore.rating.points, 12);
  assert.equal(preferredGenreScore.total, 30);
  assert.equal(preferredGenreScore.preferredGenres.points, 30);
  assert.deepEqual(
    selectRecommendations(
      [moodAndRating, preferredGenre],
      request,
    ).recommendations.map(({ candidate: selected }) => selected.media.id),
    [2, 1],
  );
});

test("diversifies a varied pool only when the base choice repeats covered genres", () => {
  const result = selectRecommendations(
    [
      candidate(movie(1, { genreIds: [18] })),
      candidate(movie(2, { genreIds: [18] })),
      candidate(movie(3, { genreIds: [35] })),
      candidate(movie(4, { genreIds: [18] })),
    ],
    {},
  );

  assert.equal(GENRE_DIVERSITY_MINIMUM_NEW_GENRES, 1);
  assert.equal(result.status, "complete");
  assert.equal(result.eligibleCount, 4);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [1, 3, 2],
  );
  assert.deepEqual(
    result.recommendations.map(
      ({ selectionEvidence }) => selectionEvidence.genreDiversity,
    ),
    [
      {
        applied: false,
        newGenreIds: [],
        affectedSelection: false,
      },
      {
        applied: true,
        newGenreIds: [35],
        affectedSelection: true,
      },
      {
        applied: true,
        newGenreIds: [],
        affectedSelection: false,
      },
    ],
  );
});

test("preserves base ranking for a homogeneous candidate pool", () => {
  const result = selectRecommendations(
    [
      candidate(movie(10, { genreIds: [18] })),
      candidate(movie(11, { genreIds: [18] })),
      candidate(movie(12, { genreIds: [18] })),
      candidate(movie(13, { genreIds: [18] })),
    ],
    {},
  );

  assert.equal(result.status, "complete");
  assert.equal(result.eligibleCount, 4);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [10, 11, 12],
  );
  assert.deepEqual(
    result.recommendations.map(
      ({ selectionEvidence }) => selectionEvidence.genreDiversity,
    ),
    [
      {
        applied: false,
        newGenreIds: [],
        affectedSelection: false,
      },
      {
        applied: true,
        newGenreIds: [],
        affectedSelection: false,
      },
      {
        applied: true,
        newGenreIds: [],
        affectedSelection: false,
      },
    ],
  );
});

test("does not trade away stronger current preference fit for genre diversity", () => {
  const result = selectRecommendations(
    [
      candidate(movie(20, { genreIds: [35] })),
      candidate(movie(21, { genreIds: [35] })),
      candidate(movie(22, { genreIds: [18] })),
    ],
    {
      softPreferences: {
        preferredGenreIds: [35],
      },
    },
  );

  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [20, 21, 22],
  );
  assert.equal(result.recommendations[0]?.score.total, 30);
  assert.equal(result.recommendations[1]?.score.total, 30);
  assert.equal(result.recommendations[2]?.score.total, 0);
  assert.deepEqual(
    result.recommendations[1]?.selectionEvidence.genreDiversity,
    {
      applied: true,
      newGenreIds: [],
      affectedSelection: false,
    },
  );
});

test("applies surprised variety after fit and temporal cohesion", () => {
  const result = selectRecommendations(
    [
      candidate(
        movie(1, {
          releaseDate: "2026-01-01",
          genreIds: [18],
        }),
      ),
      candidate(
        movie(2, {
          releaseDate: "1932-01-01",
          genreIds: [16, 35, 878],
        }),
      ),
      candidate(
        movie(3, {
          releaseDate: "1984-01-01",
          genreIds: [18],
        }),
      ),
      candidate(
        movie(4, {
          releaseDate: "1990-01-01",
          genreIds: [35, 878],
        }),
      ),
    ],
    {
      softPreferences: {
        mood: "surprised",
      },
    },
  );

  assert.equal(result.eligibleCount, 4);
  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [1, 4, 3],
  );
  assert.deepEqual(
    result.recommendations[1]?.selectionEvidence.temporalCohesion,
    {
      applied: true,
      anchorReleaseYear: 2026,
      candidateReleaseYear: 1990,
      yearGap: 36,
      classification: "within-range",
      affectedSelection: true,
    },
  );
  assert.deepEqual(
    result.recommendations[1]?.selectionEvidence.crossGenreVariety,
    {
      applied: true,
      newGenreIds: [35, 878],
      affectedSelection: true,
    },
  );
  assert.deepEqual(
    result.recommendations.map(({ score }) => score.mood.discoverySignals),
    [["cross-genre-variety"], ["cross-genre-variety"], ["cross-genre-variety"]],
  );
});

test("prefers titles inside an explicit freshness window while keeping older fallback candidates eligible", () => {
  const request: RecommendationRequest = {
    softPreferences: {
      freshness: {
        releasedSinceYear: 2020,
      },
    },
  };

  const result = selectRecommendations(
    [
      candidate(movie(1, { releaseDate: "2005-01-01" })),
      candidate(movie(2, { releaseDate: "2024-01-01" })),
      candidate(movie(3, { releaseDate: "2021-01-01" })),
      candidate(movie(4, { releaseDate: "2010-01-01" })),
    ],
    request,
  );

  assert.equal(result.status, "complete");
  assert.equal(result.eligibleCount, 4);

  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [2, 3, 1],
  );

  assert.deepEqual(
    result.recommendations.map(({ score }) => score.releaseContext.points),
    [24, 24, 0],
  );
});

test("allows a substantially stronger older fit to beat a freshness-only match", () => {
  const request: RecommendationRequest = {
    softPreferences: {
      preferredGenreIds: [35],
      freshness: {
        releasedSinceYear: 2020,
      },
    },
  };

  const result = selectRecommendations(
    [
      candidate(
        movie(1, {
          releaseDate: "2005-01-01",
          genreIds: [35],
        }),
      ),
      candidate(
        movie(2, {
          releaseDate: "2024-01-01",
          genreIds: [],
        }),
      ),
    ],
    request,
  );

  assert.equal(result.status, "limited");
  assert.equal(result.eligibleCount, 2);

  assert.deepEqual(
    result.recommendations.map(({ candidate: selected }) => selected.media.id),
    [1, 2],
  );

  assert.equal(result.recommendations[0]?.score.preferredGenres.points, 30);
  assert.equal(result.recommendations[0]?.score.releaseContext.points, 0);

  assert.equal(result.recommendations[1]?.score.preferredGenres.points, 0);
  assert.equal(result.recommendations[1]?.score.releaseContext.points, 24);
});
