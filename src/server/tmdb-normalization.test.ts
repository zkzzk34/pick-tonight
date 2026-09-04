import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTmdbMovieResult,
  normalizeTmdbTvResult,
} from "./tmdb-normalization.ts";

test("normalizes a representative TMDB movie result", () => {
  const normalized = normalizeTmdbMovieResult({
    adult: false,
    backdrop_path: " /movie-backdrop.jpg ",
    genre_ids: [18, 35, "invalid", 0, -1, 4.5],
    id: 123,
    original_language: " ko ",
    original_title: " Original movie title ",
    overview: " A movie overview. ",
    popularity: 88.4,
    poster_path: " /movie-poster.jpg ",
    release_date: "2026-08-01",
    title: " Localized movie title ",
    vote_average: 7.8,
    vote_count: 421,
    unexpected_private_field: "must not cross the normalization boundary",
  });

  assert.deepEqual(normalized, {
    source: "tmdb",
    mediaType: "movie",
    id: 123,
    title: "Localized movie title",
    originalTitle: "Original movie title",
    overview: "A movie overview.",
    releaseDate: "2026-08-01",
    originalLanguage: "ko",
    genreIds: [18, 35],
    posterPath: "/movie-poster.jpg",
    backdropPath: "/movie-backdrop.jpg",
    popularity: 88.4,
    voteAverage: 7.8,
    voteCount: 421,
    adult: false,
  });
});

test("normalizes a representative TMDB television result", () => {
  const normalized = normalizeTmdbTvResult({
    adult: false,
    backdrop_path: "/tv-backdrop.jpg",
    first_air_date: "2025-11-03",
    genre_ids: [18, 10765],
    id: 456,
    name: "Localized series name",
    original_language: "en",
    original_name: "Original series name",
    origin_country: ["US"],
    overview: "A television overview.",
    popularity: 41.2,
    poster_path: "/tv-poster.jpg",
    title: "Movie title must not be used",
    release_date: "1999-01-01",
    vote_average: 8.25,
    vote_count: 962,
    unexpected_private_field: "must not cross the normalization boundary",
  });

  assert.deepEqual(normalized, {
    source: "tmdb",
    mediaType: "tv",
    id: 456,
    title: "Localized series name",
    originalTitle: "Original series name",
    overview: "A television overview.",
    releaseDate: "2025-11-03",
    originalLanguage: "en",
    genreIds: [18, 10765],
    posterPath: "/tv-poster.jpg",
    backdropPath: "/tv-backdrop.jpg",
    popularity: 41.2,
    voteAverage: 8.25,
    voteCount: 962,
    adult: false,
  });
});

test("uses stable null and empty-array defaults for missing optional fields", () => {
  const normalized = normalizeTmdbMovieResult({
    id: 789,
    title: " Minimal movie ",
  });

  assert.deepEqual(normalized, {
    source: "tmdb",
    mediaType: "movie",
    id: 789,
    title: "Minimal movie",
    originalTitle: null,
    overview: null,
    releaseDate: null,
    originalLanguage: null,
    genreIds: [],
    posterPath: null,
    backdropPath: null,
    popularity: null,
    voteAverage: null,
    voteCount: null,
    adult: null,
  });
});

test("converts malformed optional TMDB values to safe normalized values", () => {
  const normalized = normalizeTmdbTvResult({
    adult: "false",
    backdrop_path: [],
    first_air_date: "2026-02-31",
    genre_ids: [12, 0, -4, 2.5, "18", 18],
    id: 987,
    name: "Safe series",
    original_language: " ",
    original_name: 12,
    overview: {},
    popularity: Number.POSITIVE_INFINITY,
    poster_path: 27,
    vote_average: 10.1,
    vote_count: -1,
  });

  assert.deepEqual(normalized, {
    source: "tmdb",
    mediaType: "tv",
    id: 987,
    title: "Safe series",
    originalTitle: null,
    overview: null,
    releaseDate: null,
    originalLanguage: null,
    genreIds: [12, 18],
    posterPath: null,
    backdropPath: null,
    popularity: null,
    voteAverage: null,
    voteCount: null,
    adult: null,
  });
});

test("rejects movie and television results without valid identity fields", () => {
  const invalidNormalizations = [
    () => normalizeTmdbMovieResult(null),
    () => normalizeTmdbMovieResult([]),
    () => normalizeTmdbMovieResult({}),
    () => normalizeTmdbMovieResult({ id: 0, title: "Movie" }),
    () => normalizeTmdbMovieResult({ id: 1, title: " " }),
    () => normalizeTmdbTvResult({ id: 2, name: "" }),
  ];

  for (const normalize of invalidNormalizations) {
    assert.throws(normalize, {
      name: "TmdbNormalizationError",
      message: "The TMDB media result cannot be normalized.",
    });
  }
});
