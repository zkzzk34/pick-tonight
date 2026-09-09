import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import type { TmdbDiscoveryBatch } from "./tmdb-discovery-candidates.ts";
import {
  TmdbDiscoveryError,
  type TmdbDiscoveryClientOptions,
} from "./tmdb-discovery-client.ts";
import type { TmdbDiscoveryRequestPlan } from "./tmdb-discovery-requests.ts";
import { discoverTmdbCandidates } from "./tmdb-discovery.ts";

function media(mediaType: MediaSummary["mediaType"], id: number): MediaSummary {
  return {
    source: "tmdb",
    mediaType,
    id,
    title: `${mediaType} ${id}`,
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
  };
}

function batch(
  plan: TmdbDiscoveryRequestPlan,
  candidates: readonly MediaSummary[],
): TmdbDiscoveryBatch {
  return {
    source: plan.source,
    mediaType: plan.mediaType,
    candidates,
    appliedMaximumRuntimeRestriction: plan.appliedMaximumRuntimeRestriction,
    appliedProviderRestriction: plan.appliedProviderRestriction,
  };
}

test("executes every movie and TV plan and builds one attributed pool", async () => {
  const observedSources: string[] = [];
  const sharedByMediaType = {
    movie: media("movie", 101),
    tv: media("tv", 101),
  };

  const result = await discoverTmdbCandidates(
    { hardRestrictions: { mediaType: "either" } },
    {
      fetchBatch: async (plan) => {
        observedSources.push(plan.source);
        return batch(plan, [sharedByMediaType[plan.mediaType]]);
      },
    },
  );

  assert.deepEqual(observedSources, [
    "discover-movie",
    "trending-movie-week",
    "now-playing",
    "discover-tv",
    "trending-tv-week",
    "on-the-air",
  ]);
  assert.deepEqual(
    result.candidates.map(({ media: candidate, sources }) => ({
      key: `${candidate.mediaType}:${candidate.id}`,
      sources,
    })),
    [
      {
        key: "movie:101",
        sources: ["discover-movie", "trending-movie-week", "now-playing"],
      },
      {
        key: "tv:101",
        sources: ["discover-tv", "trending-tv-week", "on-the-air"],
      },
    ],
  );
  assert.deepEqual(result.failures, []);
});

test("keeps successful candidates when one supplemental source fails", async () => {
  const result = await discoverTmdbCandidates(
    { hardRestrictions: { mediaType: "movie" } },
    {
      fetchBatch: async (plan) => {
        if (plan.source === "trending-movie-week") {
          throw new TmdbDiscoveryError("RATE_LIMIT_ERROR", 429);
        }

        return batch(plan, [
          media("movie", plan.source === "now-playing" ? 2 : 1),
        ]);
      },
    },
  );

  assert.deepEqual(
    result.candidates.map(({ media: candidate }) => candidate.id),
    [1, 2],
  );
  assert.deepEqual(result.failures, [
    { source: "trending-movie-week", code: "RATE_LIMIT_ERROR" },
  ]);
});

test("replaces unexpected partial failures with non-reflective metadata", async () => {
  const unsafeDetail = "upstream-secret-that-must-not-be-reflected";

  const result = await discoverTmdbCandidates(
    { hardRestrictions: { mediaType: "tv" } },
    {
      fetchBatch: async (plan) => {
        if (plan.source === "on-the-air") {
          throw new Error(unsafeDetail);
        }

        return batch(plan, [media("tv", 3)]);
      },
    },
  );

  assert.deepEqual(result.failures, [
    { source: "on-the-air", code: "UPSTREAM_ERROR" },
  ]);
  assert.equal(JSON.stringify(result).includes(unsafeDetail), false);
});

test("throws the primary safe error when every planned source fails", async () => {
  const unsafeDetail = "credential-like-detail-that-must-not-be-reflected";

  await assert.rejects(
    discoverTmdbCandidates(
      { hardRestrictions: { mediaType: "movie" } },
      {
        fetchBatch: async (plan) => {
          if (plan.source === "discover-movie") {
            throw new TmdbDiscoveryError("AUTHENTICATION_ERROR", 401);
          }

          throw new Error(unsafeDetail);
        },
      },
    ),
    (error) =>
      error instanceof TmdbDiscoveryError &&
      error.code === "AUTHENTICATION_ERROR" &&
      error.status === 401 &&
      !error.message.includes(unsafeDetail),
  );
});

test("passes client options through without requiring a live request", async () => {
  const expectedOptions: TmdbDiscoveryClientOptions = {
    token: "unit-test-token",
    timeoutMs: 123,
  };
  const observedOptions: TmdbDiscoveryClientOptions[] = [];

  await discoverTmdbCandidates(
    { hardRestrictions: { mediaType: "movie" } },
    {
      ...expectedOptions,
      fetchBatch: async (plan, options) => {
        observedOptions.push(options ?? {});
        return batch(plan, []);
      },
    },
  );

  assert.equal(observedOptions.length, 3);
  for (const options of observedOptions) {
    assert.equal(options.token, expectedOptions.token);
    assert.equal(options.timeoutMs, expectedOptions.timeoutMs);
  }
});
