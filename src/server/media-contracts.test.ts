import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaSummarySchema,
  type MediaSummary,
} from "../shared/media-contracts.ts";
import { recommendationResponseSchema } from "../shared/recommendation-contracts.ts";

const MOVIE_SUMMARY: MediaSummary = {
  source: "tmdb",
  mediaType: "movie",
  id: 101,
  title: "Movie title",
  originalTitle: "Original movie title",
  overview: "Movie overview",
  releaseDate: "2026-01-15",
  originalLanguage: "en",
  genreIds: [12, 18],
  posterPath: "/movie-poster.jpg",
  backdropPath: "/movie-backdrop.jpg",
  popularity: 32.5,
  voteAverage: 7.4,
  voteCount: 240,
  adult: false,
};

const TV_SUMMARY: MediaSummary = {
  source: "tmdb",
  mediaType: "tv",
  id: 202,
  title: "Series title",
  originalTitle: null,
  overview: null,
  releaseDate: null,
  originalLanguage: "ja",
  genreIds: [16],
  posterPath: null,
  backdropPath: null,
  popularity: null,
  voteAverage: null,
  voteCount: null,
  adult: null,
};

test("accepts normalized movie and television summaries", () => {
  assert.deepEqual(mediaSummarySchema.parse(MOVIE_SUMMARY), MOVIE_SUMMARY);
  assert.deepEqual(mediaSummarySchema.parse(TV_SUMMARY), TV_SUMMARY);
});

test("rejects unsupported, incomplete, malformed, and raw media summaries", () => {
  const invalidSummaries = [
    { ...MOVIE_SUMMARY, mediaType: "either" },
    { ...MOVIE_SUMMARY, posterPath: undefined },
    { ...MOVIE_SUMMARY, releaseDate: "2026-02-31" },
    { ...MOVIE_SUMMARY, original_title: "Raw TMDB field" },
  ];

  for (const summary of invalidSummaries) {
    assert.equal(mediaSummarySchema.safeParse(summary).success, false);
  }
});

test("accepts zero through three normalized recommendations", () => {
  const recommendations = [
    MOVIE_SUMMARY,
    TV_SUMMARY,
    { ...MOVIE_SUMMARY, id: 303, title: "Another movie" },
  ];

  for (let count = 0; count <= 3; count += 1) {
    const response = {
      data: { recommendations: recommendations.slice(0, count) },
    };

    assert.equal(
      recommendationResponseSchema.safeParse(response).success,
      true,
    );
  }
});

test("rejects raw items and more than three normalized recommendations", () => {
  const rawItemResponse = {
    data: {
      recommendations: [
        {
          id: 404,
          title: "Raw movie",
          original_title: "Raw original title",
          release_date: "2026-03-02",
        },
      ],
    },
  };

  const excessiveResponse = {
    data: {
      recommendations: [
        MOVIE_SUMMARY,
        TV_SUMMARY,
        { ...MOVIE_SUMMARY, id: 303 },
        { ...TV_SUMMARY, id: 404 },
      ],
    },
  };

  assert.equal(
    recommendationResponseSchema.safeParse(rawItemResponse).success,
    false,
  );
  assert.equal(
    recommendationResponseSchema.safeParse(excessiveResponse).success,
    false,
  );
});
