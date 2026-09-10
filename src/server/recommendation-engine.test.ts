import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";
import {
  candidateSatisfiesHardRestrictions,
  scoreRecommendationCandidate,
} from "./recommendation-engine.ts";
import type {
  TmdbDiscoveryCandidate,
  TmdbDiscoverySource,
  TmdbHardRestrictionEvidence,
} from "./tmdb-discovery-candidates.ts";

function media(
  mediaType: MediaSummary["mediaType"],
  id: number,
  overrides: Partial<MediaSummary> = {},
): MediaSummary {
  return {
    source: "tmdb",
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
    mediaType,
    id,
    title: overrides.title ?? `${mediaType} ${id}`,
  };
}

function candidate(
  item: MediaSummary,
  hardRestrictionEvidence: TmdbHardRestrictionEvidence = {
    maximumRuntimeMinutes: null,
    providerRestriction: null,
  },
  sources?: readonly TmdbDiscoverySource[],
): TmdbDiscoveryCandidate {
  const defaultSource: TmdbDiscoverySource =
    item.mediaType === "movie" ? "discover-movie" : "discover-tv";

  return {
    media: item,
    sources: sources ?? [defaultSource],
    hardRestrictionEvidence,
  };
}

test("requires every hard restriction to pass with exact query evidence", () => {
  const request: RecommendationRequest = {
    hardRestrictions: {
      mediaType: "movie",
      excludedGenreIds: [27],
      maximumRuntimeMinutes: 120,
      requiredProviderIds: [8, 9],
    },
    watchRegion: "US",
  };
  const validEvidence = {
    maximumRuntimeMinutes: 120,
    providerRestriction: {
      watchRegion: "US",
      requiredProviderIds: [9, 8],
    },
  } as const satisfies TmdbHardRestrictionEvidence;
  const eligibleCandidate = candidate(
    media("movie", 1, { genreIds: [35] }),
    validEvidence,
  );

  assert.equal(
    candidateSatisfiesHardRestrictions(eligibleCandidate, request),
    true,
  );

  const failureCases: readonly [string, TmdbDiscoveryCandidate][] = [
    ["wrong media type", candidate(media("tv", 2), validEvidence)],
    [
      "adult title",
      candidate(media("movie", 3, { adult: true }), validEvidence),
    ],
    [
      "excluded genre",
      candidate(media("movie", 4, { genreIds: [18, 27] }), validEvidence),
    ],
    [
      "missing runtime evidence",
      candidate(media("movie", 5), {
        ...validEvidence,
        maximumRuntimeMinutes: null,
      }),
    ],
    [
      "different runtime evidence",
      candidate(media("movie", 6), {
        ...validEvidence,
        maximumRuntimeMinutes: 90,
      }),
    ],
    [
      "missing provider evidence",
      candidate(media("movie", 7), {
        ...validEvidence,
        providerRestriction: null,
      }),
    ],
    [
      "different provider region",
      candidate(media("movie", 8), {
        ...validEvidence,
        providerRestriction: {
          watchRegion: "CA",
          requiredProviderIds: [8, 9],
        },
      }),
    ],
    [
      "different provider request",
      candidate(media("movie", 9), {
        ...validEvidence,
        providerRestriction: {
          watchRegion: "US",
          requiredProviderIds: [8],
        },
      }),
    ],
  ];

  for (const [label, ineligibleCandidate] of failureCases) {
    assert.equal(
      candidateSatisfiesHardRestrictions(ineligibleCandidate, request),
      false,
      label,
    );
  }

  assert.equal(
    candidateSatisfiesHardRestrictions(eligibleCandidate, {
      hardRestrictions: { requiredProviderIds: [8, 9] },
    }),
    false,
    "provider requirement without a watch region must fail closed",
  );
});

test("produces the documented fixed scoring breakdown and caps genres", () => {
  const item = candidate(
    media("movie", 10, {
      genreIds: [35, 12, 28],
      originalLanguage: "en",
      releaseDate: "1987-06-12",
      popularity: 999,
      voteAverage: 8.6,
      voteCount: 600,
    }),
    undefined,
    ["trending-movie-week"],
  );
  const score = scoreRecommendationCandidate(item, {
    softPreferences: {
      preferredGenreIds: [35, 28, 12],
      mood: "excited",
      contentLanguage: "en",
    },
  });

  assert.deepEqual(score, {
    version: "recommendation-v1",
    preferredGenres: {
      requestedGenreIds: [35, 28, 12],
      matchedGenreIds: [35, 28, 12],
      points: 60,
    },
    mood: {
      requestedMood: "excited",
      matchedGenreIds: [28, 12],
      discoverySignals: [],
      points: 22,
    },
    contentLanguage: {
      requestedLanguage: "en",
      actualLanguage: "en",
      matched: true,
      points: 12,
    },
    rating: {
      voteAverage: 8.6,
      voteCount: 600,
      confidenceTier: "high",
      confidenceFactor: 1,
      points: 17,
    },
    releaseContext: {
      releaseYear: 1987,
      points: 0,
    },
    total: 111,
  });
});

test("preserves surprised as zero-point cross-genre selection evidence", () => {
  const score = scoreRecommendationCandidate(
    candidate(media("movie", 20, { genreIds: [18, 35] })),
    { softPreferences: { mood: "surprised" } },
  );

  assert.deepEqual(score.mood, {
    requestedMood: "surprised",
    matchedGenreIds: [],
    discoverySignals: ["cross-genre-variety"],
    points: 0,
  });
  assert.equal(score.total, 0);
});
