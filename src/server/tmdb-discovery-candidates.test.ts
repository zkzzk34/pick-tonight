import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";
import {
  createTmdbDiscoveryCandidatePool,
  type TmdbDiscoveryBatch,
  type TmdbDiscoverySource,
} from "./tmdb-discovery-candidates.ts";

function movie(
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
    mediaType: "movie",
    id,
    title: overrides.title ?? `Movie ${id}`,
  };
}

function television(
  id: number,
  overrides: Partial<MediaSummary> = {},
): MediaSummary {
  return {
    ...movie(id, overrides),
    mediaType: "tv",
    title: overrides.title ?? `Television ${id}`,
  };
}

function batch({
  source,
  mediaType,
  candidates,
  appliedMaximumRuntimeRestriction = false,
  appliedProviderRestriction = false,
}: {
  source: TmdbDiscoverySource;
  mediaType: MediaSummary["mediaType"];
  candidates: readonly MediaSummary[];
  appliedMaximumRuntimeRestriction?: boolean;
  appliedProviderRestriction?: boolean;
}): TmdbDiscoveryBatch {
  return {
    source,
    mediaType,
    candidates,
    appliedMaximumRuntimeRestriction,
    appliedProviderRestriction,
  };
}

const BROAD_REQUEST: RecommendationRequest = {};

test("deduplicates by media type and TMDB ID while retaining every source", () => {
  const sharedMovie = movie(101);
  const candidates = createTmdbDiscoveryCandidatePool(
    [
      batch({
        source: "discover-movie",
        mediaType: "movie",
        candidates: [sharedMovie],
      }),
      batch({
        source: "trending-movie-week",
        mediaType: "movie",
        candidates: [sharedMovie, movie(102), television(999)],
      }),
      batch({
        source: "discover-tv",
        mediaType: "tv",
        candidates: [television(101)],
      }),
    ],
    BROAD_REQUEST,
  );

  assert.deepEqual(
    candidates.map(({ media, sources }) => ({
      key: `${media.mediaType}:${media.id}`,
      sources,
    })),
    [
      {
        key: "movie:101",
        sources: ["discover-movie", "trending-movie-week"],
      },
      { key: "movie:102", sources: ["trending-movie-week"] },
      { key: "tv:101", sources: ["discover-tv"] },
    ],
  );
  assert.deepEqual(
    candidates.map(({ hardRestrictionEvidence }) => hardRestrictionEvidence),
    [
      { maximumRuntimeMinutes: null, providerRestriction: null },
      { maximumRuntimeMinutes: null, providerRestriction: null },
      { maximumRuntimeMinutes: null, providerRestriction: null },
    ],
  );
});

test("excludes adult and forbidden-genre candidates across duplicate sources", () => {
  const candidates = createTmdbDiscoveryCandidatePool(
    [
      batch({
        source: "discover-movie",
        mediaType: "movie",
        candidates: [movie(201), movie(202), movie(203, { adult: null })],
      }),
      batch({
        source: "trending-movie-week",
        mediaType: "movie",
        candidates: [
          movie(201, { adult: true }),
          movie(202, { genreIds: [18, 27] }),
        ],
      }),
    ],
    {
      hardRestrictions: {
        excludedGenreIds: [27],
      },
    },
  );

  assert.deepEqual(
    candidates.map(({ media }) => media.id),
    [203],
  );
});

test("does not let supplemental sources bypass runtime and provider restrictions", () => {
  const verifiedCandidate = movie(301);
  const candidates = createTmdbDiscoveryCandidatePool(
    [
      batch({
        source: "discover-movie",
        mediaType: "movie",
        candidates: [verifiedCandidate],
        appliedMaximumRuntimeRestriction: true,
        appliedProviderRestriction: true,
      }),
      batch({
        source: "trending-movie-week",
        mediaType: "movie",
        candidates: [verifiedCandidate, movie(302)],
      }),
      batch({
        source: "now-playing",
        mediaType: "movie",
        candidates: [movie(303)],
        appliedMaximumRuntimeRestriction: true,
      }),
      batch({
        source: "discover-movie",
        mediaType: "movie",
        candidates: [movie(304)],
        appliedProviderRestriction: true,
      }),
    ],
    {
      hardRestrictions: {
        maximumRuntimeMinutes: 120,
        requiredProviderIds: [8],
      },
      watchRegion: "US",
    },
  );

  assert.deepEqual(
    candidates.map(({ media, sources, hardRestrictionEvidence }) => ({
      id: media.id,
      sources,
      hardRestrictionEvidence,
    })),
    [
      {
        id: 301,
        sources: ["discover-movie", "trending-movie-week"],
        hardRestrictionEvidence: {
          maximumRuntimeMinutes: 120,
          providerRestriction: {
            watchRegion: "US",
            requiredProviderIds: [8],
          },
        },
      },
    ],
  );
});

test("retains unique supplemental candidates when no unverifiable filter applies", () => {
  const candidates = createTmdbDiscoveryCandidatePool(
    [
      batch({
        source: "trending-tv-week",
        mediaType: "tv",
        candidates: [television(401)],
      }),
      batch({
        source: "on-the-air",
        mediaType: "tv",
        candidates: [television(402)],
      }),
    ],
    BROAD_REQUEST,
  );

  assert.deepEqual(
    candidates.map(({ media }) => media.id),
    [401, 402],
  );
});

test("enforces the requested media type even for unexpected batches", () => {
  const batches = [
    batch({
      source: "discover-movie",
      mediaType: "movie",
      candidates: [movie(501)],
    }),
    batch({
      source: "discover-tv",
      mediaType: "tv",
      candidates: [television(502)],
    }),
  ];

  const keysFor = (request: RecommendationRequest) =>
    createTmdbDiscoveryCandidatePool(batches, request).map(
      ({ media }) => `${media.mediaType}:${media.id}`,
    );

  assert.deepEqual(keysFor({ hardRestrictions: { mediaType: "movie" } }), [
    "movie:501",
  ]);
  assert.deepEqual(keysFor({ hardRestrictions: { mediaType: "tv" } }), [
    "tv:502",
  ]);
  assert.deepEqual(keysFor({ hardRestrictions: { mediaType: "either" } }), [
    "movie:501",
    "tv:502",
  ]);
});
