import assert from "node:assert/strict";
import test from "node:test";

import {
  productRecommendationResponseSchema,
  productTitleDetailResponseSchema,
} from "../shared/product-api-contracts.ts";
import {
  handleProductApiRequest,
  type ProductApiResult,
} from "./product-api-handler.ts";
import type { ProductApiServiceDependencies } from "./product-api-service.ts";
import { TmdbDiscoveryError } from "./tmdb-discovery-client.ts";
import type { TmdbDiscoveryCandidate } from "./tmdb-discovery-candidates.ts";
import type { TmdbTitleDetails } from "./tmdb-title-normalization.ts";

function candidate(id: number): TmdbDiscoveryCandidate {
  return {
    media: {
      source: "tmdb",
      mediaType: "movie",
      id,
      title: `Movie ${id}`,
      originalTitle: `Movie ${id}`,
      overview: `Overview for Movie ${id}`,
      releaseDate: "2024-01-01",
      originalLanguage: "en",
      genreIds: [35],
      posterPath: null,
      backdropPath: null,
      popularity: 50,
      voteAverage: 7.5,
      voteCount: 750,
      adult: false,
    },
    sources: ["discover-movie"],
    hardRestrictionEvidence: {
      maximumRuntimeMinutes: null,
      providerRestriction: null,
    },
  };
}

function titleDetails(id: number): TmdbTitleDetails {
  return {
    source: "tmdb",
    mediaType: "movie",
    id,
    title: `Movie ${id}`,
    originalTitle: `Movie ${id}`,
    overview: `Current details for Movie ${id}`,
    releaseDate: "2024-01-01",
    originalLanguage: "en",
    genres: [
      {
        id: 35,
        name: "Comedy",
      },
    ],
    runtime: {
      kind: "movie",
      minutes: 100,
    },
    posterUrl: `https://image.example.test/poster-${id}.jpg`,
    backdropUrl: null,
    voteAverage: 7.5,
    voteCount: 750,
    adult: false,
    trailerUrl: null,
    providerAvailability: null,
  };
}

const dependencies: ProductApiServiceDependencies = {
  discoverCandidates: async () => ({
    candidates: [candidate(1), candidate(2), candidate(3), candidate(4)],
    failures: [],
  }),
  fetchTitleDetails: async (_mediaType, id) => titleDetails(id),
};

function responseText(result: ProductApiResult): string {
  return JSON.stringify(result.body);
}

test("POST /api/recommendations returns three browser-ready recommendations", async () => {
  const result = await handleProductApiRequest(
    {
      method: "POST",
      requestTarget: "/api/recommendations",
      body: JSON.stringify({
        request: {
          hardRestrictions: {
            mediaType: "movie",
          },
          watchRegion: "US",
        },
        requestedCount: 3,
      }),
    },
    dependencies,
  );

  assert.equal(result.statusCode, 200);

  const parsed = productRecommendationResponseSchema.parse(result.body);

  assert.deepEqual(
    parsed.data.recommendations.map(({ mediaKey }) => mediaKey),
    ["movie:1", "movie:2", "movie:3"],
  );

  assert.deepEqual(
    parsed.data.recommendations.map(({ title }) => title),
    ["Movie 1", "Movie 2", "Movie 3"],
  );

  assert.ok(
    parsed.data.recommendations.every(({ posterUrl }) => posterUrl !== null),
  );
});

test("replacement request honors active-session exclusions and returns one unseen title", async () => {
  const result = await handleProductApiRequest(
    {
      method: "POST",
      requestTarget: "/api/recommendations",
      body: JSON.stringify({
        request: {
          hardRestrictions: {
            mediaType: "movie",
          },
          watchRegion: "US",
        },
        requestedCount: 1,
        exclusions: {
          shownMediaKeys: ["movie:1", "movie:2", "movie:3"],
          removedMediaKeys: ["movie:2"],
        },
      }),
    },
    dependencies,
  );

  assert.equal(result.statusCode, 200);

  const parsed = productRecommendationResponseSchema.parse(result.body);

  assert.equal(parsed.data.recommendations.length, 1);
  assert.equal(parsed.data.recommendations[0]?.mediaKey, "movie:4");
});

test("GET /api/titles/:mediaType/:id returns current title enrichment", async () => {
  const result = await handleProductApiRequest(
    {
      method: "GET",
      requestTarget: "/api/titles/movie/2?watchRegion=US",
    },
    dependencies,
  );

  assert.equal(result.statusCode, 200);

  const parsed = productTitleDetailResponseSchema.parse(result.body);

  assert.equal(parsed.data.mediaKey, "movie:2");
  assert.equal(parsed.data.title, "Movie 2");
  assert.equal(parsed.data.watchRegion, "US");
  assert.equal(parsed.data.overview, "Current details for Movie 2");
});

test("product routes reject unsupported methods and malformed bodies safely", async () => {
  const wrongMethod = await handleProductApiRequest(
    {
      method: "GET",
      requestTarget: "/api/recommendations",
    },
    dependencies,
  );

  assert.equal(wrongMethod.statusCode, 405);
  assert.deepEqual(wrongMethod.headers, {
    Allow: "POST",
  });

  const malformed = await handleProductApiRequest(
    {
      method: "POST",
      requestTarget: "/api/recommendations",
      body: '{"request":',
    },
    dependencies,
  );

  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.body, {
    error: {
      code: "INVALID_REQUEST",
      message: "The recommendation request is invalid.",
    },
  });
});

test("upstream authentication failures use fixed non-reflective output", async () => {
  const secret = "private-upstream-value-that-must-not-be-reflected";

  const result = await handleProductApiRequest(
    {
      method: "POST",
      requestTarget: "/api/recommendations",
      body: JSON.stringify({
        request: {
          watchRegion: "US",
        },
        requestedCount: 3,
      }),
    },
    {
      discoverCandidates: async () => {
        void secret;
        throw new TmdbDiscoveryError("AUTHENTICATION_ERROR");
      },
    },
  );

  assert.equal(result.statusCode, 502);
  assert.equal(responseText(result).includes(secret), false);

  assert.deepEqual(result.body, {
    error: {
      code: "UPSTREAM_AUTHENTICATION_ERROR",
      message:
        "PickTonight could not authenticate with its recommendation data provider.",
    },
  });
});
