import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTmdbGenres,
  normalizeTmdbImageConfiguration,
  normalizeTmdbWatchProviderRegions,
  normalizeTmdbWatchProviders,
  TMDB_REFERENCE_NORMALIZATION_ERROR_MESSAGE,
  TmdbReferenceNormalizationError,
} from "./tmdb-reference-normalization.ts";

const VALID_IMAGES = {
  base_url: "http://image.tmdb.org/t/p/",
  secure_base_url: "https://image.tmdb.org/t/p/",
  backdrop_sizes: ["w300", "original"],
  logo_sizes: ["w45", "original"],
  poster_sizes: ["w92", "w500", "original"],
  profile_sizes: ["w45", "h632", "original"],
  still_sizes: ["w92", "w300", "original"],
} as const;

function isFixedNormalizationError(error: unknown): boolean {
  return (
    error instanceof TmdbReferenceNormalizationError &&
    error.name === "TmdbReferenceNormalizationError" &&
    error.message === TMDB_REFERENCE_NORMALIZATION_ERROR_MESSAGE
  );
}

test("normalizes and allowlists TMDB image configuration", () => {
  const normalized = normalizeTmdbImageConfiguration({
    change_keys: ["do-not-copy"],
    images: {
      ...VALID_IMAGES,
      base_url: " http://image.tmdb.org/t/p ",
      secure_base_url: " https://image.tmdb.org/t/p/ ",
      backdrop_sizes: ["w300", "original", "w300", 123],
      unexpected: "do-not-copy",
    },
    unexpected: "do-not-copy",
  });

  assert.deepEqual(normalized, {
    baseUrl: "http://image.tmdb.org/t/p/",
    secureBaseUrl: "https://image.tmdb.org/t/p/",
    backdropSizes: ["w300", "original"],
    logoSizes: ["w45", "original"],
    posterSizes: ["w92", "w500", "original"],
    profileSizes: ["w45", "h632", "original"],
    stillSizes: ["w92", "w300", "original"],
  });
});

test("rejects missing or unsafe required image configuration", () => {
  for (const payload of [
    null,
    {},
    {
      images: {
        ...VALID_IMAGES,
        secure_base_url: "ftp://unsafe.example/images/",
      },
    },
    {
      images: {
        ...VALID_IMAGES,
        still_sizes: [],
      },
    },
  ]) {
    assert.throws(
      () => normalizeTmdbImageConfiguration(payload),
      isFixedNormalizationError,
    );
  }
});

test("normalizes, filters, and deduplicates localized genre entries", () => {
  assert.deepEqual(
    normalizeTmdbGenres({
      genres: [
        { id: 28, name: " Action ", unexpected: "drop" },
        { id: 35, name: "Comedy" },
        { id: 28, name: "Duplicate action" },
        { id: 0, name: "Invalid ID" },
        { id: 18, name: " " },
        "invalid",
      ],
      unexpected: "drop",
    }),
    [
      { id: 28, name: "Action" },
      { id: 35, name: "Comedy" },
    ],
  );

  assert.deepEqual(normalizeTmdbGenres({ genres: [] }), []);
});

test("normalizes provider regions without leaking raw fields", () => {
  assert.deepEqual(
    normalizeTmdbWatchProviderRegions({
      results: [
        {
          iso_3166_1: "us",
          english_name: " United States of America ",
          native_name: "United States",
          unexpected: "drop",
        },
        {
          iso_3166_1: "CA",
          english_name: "Canada",
          native_name: null,
        },
        {
          iso_3166_1: "US",
          english_name: "Duplicate",
          native_name: "Duplicate",
        },
        {
          iso_3166_1: "USA",
          english_name: "Invalid",
        },
        {
          iso_3166_1: "GB",
          english_name: " ",
        },
      ],
    }),
    [
      {
        code: "US",
        englishName: "United States of America",
        nativeName: "United States",
      },
      {
        code: "CA",
        englishName: "Canada",
        nativeName: null,
      },
    ],
  );
});

test("normalizes provider identity, artwork, and display priorities", () => {
  assert.deepEqual(
    normalizeTmdbWatchProviders({
      results: [
        {
          provider_id: 8,
          provider_name: " Netflix ",
          logo_path: " /netflix.jpg ",
          display_priority: 0,
          display_priorities: {
            US: 0,
            ca: 1,
            GB: -1,
            DE: 1.5,
            USA: 2,
          },
          unexpected: "drop",
        },
        {
          provider_id: 9,
          provider_name: "Example Provider",
          logo_path: "https://unsafe.example/logo.jpg",
          display_priority: "1",
          display_priorities: null,
        },
        {
          provider_id: 8,
          provider_name: "Duplicate Netflix",
        },
        {
          provider_id: -1,
          provider_name: "Invalid",
        },
        {
          provider_id: 10,
          provider_name: "",
        },
      ],
    }),
    [
      {
        id: 8,
        name: "Netflix",
        logoPath: "/netflix.jpg",
        displayPriority: 0,
        displayPriorities: {
          CA: 1,
          US: 0,
        },
      },
      {
        id: 9,
        name: "Example Provider",
        logoPath: null,
        displayPriority: null,
        displayPriorities: {},
      },
    ],
  );

  assert.deepEqual(normalizeTmdbWatchProviders({ results: [] }), []);
});

test("requires documented collection envelopes and uses fixed errors", () => {
  const unsafePayload = "sensitive-upstream-value";

  for (const operation of [
    () => normalizeTmdbGenres({ results: [] }),
    () => normalizeTmdbWatchProviderRegions({ regions: [] }),
    () => normalizeTmdbWatchProviders({ results: unsafePayload }),
  ]) {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof TmdbReferenceNormalizationError);
      assert.equal(error.message, TMDB_REFERENCE_NORMALIZATION_ERROR_MESSAGE);
      assert.equal(error.message.includes(unsafePayload), false);
      return true;
    });
  }
});
