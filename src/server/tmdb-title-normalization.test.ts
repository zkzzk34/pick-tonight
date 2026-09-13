import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTmdbTitleDetails,
  TMDB_TITLE_NORMALIZATION_ERROR_MESSAGE,
  TmdbTitleNormalizationError,
} from "./tmdb-title-normalization.ts";
import type { TmdbImageConfiguration } from "./tmdb-reference-normalization.ts";

const IMAGE_CONFIGURATION = {
  baseUrl: "http://image.tmdb.org/t/p/",
  secureBaseUrl: "https://image.tmdb.org/t/p/",
  backdropSizes: ["w300", "original", "w1280"],
  logoSizes: ["w45", "original", "w92"],
  posterSizes: ["w92", "w500", "original"],
  profileSizes: ["w45", "original"],
  stillSizes: ["w92", "original"],
} as const satisfies TmdbImageConfiguration;

function isFixedNormalizationError(error: unknown): boolean {
  return (
    error instanceof TmdbTitleNormalizationError &&
    error.message === TMDB_TITLE_NORMALIZATION_ERROR_MESSAGE
  );
}

test("normalizes representative movie details, images, video, and provider groups", () => {
  const normalized = normalizeTmdbTitleDetails({
    mediaType: "movie",
    id: 550,
    watchRegion: "us",
    imageConfiguration: IMAGE_CONFIGURATION,
    detailPayload: {
      adult: false,
      backdrop_path: "https://unsafe.example/backdrop.jpg",
      genres: [
        { id: 18, name: " Drama " },
        { id: 53, name: "Thriller" },
        { id: 18, name: "Duplicate" },
        { id: 0, name: "Invalid" },
      ],
      id: 550,
      original_language: "en",
      original_title: " Fight Club ",
      overview: " A movie overview. ",
      poster_path: " /poster.jpg ",
      release_date: "1999-10-15",
      runtime: 139,
      title: "Fight Club",
      vote_average: 8.4,
      vote_count: 31_000,
      unexpected_private_field: "drop",
    },
    imagePayload: {
      id: 550,
      backdrops: [{ file_path: "/fallback-backdrop.jpg" }],
      posters: [{ file_path: "/fallback-poster.jpg" }],
      logos: [],
      unexpected_private_field: "drop",
    },
    videoPayload: {
      id: 550,
      results: [
        {
          key: "unofficial-trailer",
          official: false,
          site: "YouTube",
          type: "Trailer",
        },
        {
          key: "official-teaser",
          official: true,
          site: "YouTube",
          type: "Teaser",
        },
        {
          key: "vimeo-trailer",
          official: true,
          site: "Vimeo",
          type: "Trailer",
        },
        {
          key: "youtube trailer key",
          official: true,
          site: "YouTube",
          type: "Trailer",
        },
      ],
    },
    providerPayload: {
      id: 550,
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/550/watch?locale=US",
          flatrate: [
            {
              provider_id: 8,
              provider_name: " Netflix ",
              logo_path: "/netflix.jpg",
            },
            { provider_id: 8, provider_name: "Duplicate" },
          ],
          free: [{ provider_id: 73, provider_name: "Tubi" }],
          ads: [{ provider_id: 300, provider_name: "Pluto TV" }],
          rent: [{ provider_id: 2, provider_name: "Apple TV" }],
          buy: [{ provider_id: 10, provider_name: "Amazon Video" }],
        },
      },
    },
  });

  assert.deepEqual(normalized, {
    source: "tmdb",
    mediaType: "movie",
    id: 550,
    title: "Fight Club",
    originalTitle: "Fight Club",
    overview: "A movie overview.",
    releaseDate: "1999-10-15",
    originalLanguage: "en",
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" },
    ],
    runtime: { kind: "movie", minutes: 139 },
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/fallback-backdrop.jpg",
    voteAverage: 8.4,
    voteCount: 31_000,
    adult: false,
    trailerUrl: "https://www.youtube.com/watch?v=youtube+trailer+key",
    providerAvailability: {
      source: "justwatch",
      watchRegion: "US",
      tmdbUrl: "https://www.themoviedb.org/movie/550/watch?locale=US",
      streaming: [
        {
          id: 8,
          name: "Netflix",
          logoUrl: "https://image.tmdb.org/t/p/w92/netflix.jpg",
        },
      ],
      free: [{ id: 73, name: "Tubi", logoUrl: null }],
      advertising: [{ id: 300, name: "Pluto TV", logoUrl: null }],
      rental: [{ id: 2, name: "Apple TV", logoUrl: null }],
      purchase: [{ id: 10, name: "Amazon Video", logoUrl: null }],
    },
  });
});

test("normalizes television field names and honest missing regional availability", () => {
  const normalized = normalizeTmdbTitleDetails({
    mediaType: "tv",
    id: 1396,
    watchRegion: "US",
    imageConfiguration: IMAGE_CONFIGURATION,
    detailPayload: {
      adult: false,
      backdrop_path: "/series-backdrop.jpg",
      episode_run_time: [0, "invalid", 47, 52],
      first_air_date: "2008-01-20",
      genres: [{ id: 18, name: "Drama" }],
      id: 1396,
      name: "Breaking Bad",
      original_language: "en",
      original_name: "Breaking Bad",
      overview: "A television overview.",
      poster_path: null,
      release_date: "1999-01-01",
      runtime: 999,
      title: "Movie field must not be used",
      vote_average: 8.9,
      vote_count: 14_000,
    },
    imagePayload: {
      id: 1396,
      backdrops: [],
      posters: [
        { file_path: "https://unsafe.example/poster.jpg" },
        { file_path: "/series-poster.jpg" },
      ],
      logos: [],
    },
    videoPayload: {
      id: 1396,
      results: [
        {
          key: "unofficial",
          official: false,
          site: "YouTube",
          type: "Trailer",
        },
      ],
    },
    providerPayload: {
      id: 1396,
      results: {
        CA: {
          link: "https://www.themoviedb.org/tv/1396/watch?locale=CA",
          flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
        },
      },
    },
  });

  assert.equal(normalized.mediaType, "tv");
  assert.equal(normalized.title, "Breaking Bad");
  assert.equal(normalized.releaseDate, "2008-01-20");
  assert.deepEqual(normalized.runtime, { kind: "episode", minutes: 47 });
  assert.equal(
    normalized.posterUrl,
    "https://image.tmdb.org/t/p/w500/series-poster.jpg",
  );
  assert.equal(
    normalized.backdropUrl,
    "https://image.tmdb.org/t/p/w1280/series-backdrop.jpg",
  );
  assert.equal(normalized.trailerUrl, null);
  assert.equal(normalized.providerAvailability, null);
});

test("keeps legitimate missing optional enrichment explicit", () => {
  const normalized = normalizeTmdbTitleDetails({
    mediaType: "movie",
    id: 7,
    imageConfiguration: IMAGE_CONFIGURATION,
    detailPayload: { id: 7, title: "Minimal movie" },
    imagePayload: { id: 7, backdrops: [], posters: [], logos: [] },
    videoPayload: { id: 7, results: [] },
  });

  assert.equal(normalized.posterUrl, null);
  assert.equal(normalized.backdropUrl, null);
  assert.equal(normalized.runtime, null);
  assert.equal(normalized.trailerUrl, null);
  assert.equal(normalized.providerAvailability, null);
  assert.deepEqual(normalized.genres, []);
});

test("rejects identity mismatches and malformed required envelopes safely", () => {
  const unsafeValue = "private-upstream-value";
  const baseInput = {
    mediaType: "movie",
    id: 10,
    imageConfiguration: IMAGE_CONFIGURATION,
    detailPayload: { id: 10, title: "Movie" },
    imagePayload: { id: 10, backdrops: [], posters: [] },
    videoPayload: { id: 10, results: [] },
  } as const;

  for (const input of [
    { ...baseInput, detailPayload: { id: 11, title: "Wrong title" } },
    { ...baseInput, detailPayload: { id: 10, title: " " } },
    {
      ...baseInput,
      imagePayload: { id: 11, backdrops: [], posters: [] },
    },
    { ...baseInput, imagePayload: { posters: unsafeValue } },
    { ...baseInput, videoPayload: { id: 11, results: [] } },
    { ...baseInput, videoPayload: { results: unsafeValue } },
    {
      ...baseInput,
      watchRegion: "US",
      providerPayload: { id: 11, results: {} },
    },
    {
      ...baseInput,
      watchRegion: "US",
      providerPayload: { results: unsafeValue },
    },
  ]) {
    assert.throws(
      () => normalizeTmdbTitleDetails(input),
      (error: unknown) => {
        assert.equal(isFixedNormalizationError(error), true);
        assert.equal((error as Error).message.includes(unsafeValue), false);
        return true;
      },
    );
  }
});
