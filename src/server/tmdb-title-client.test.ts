import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import {
  TmdbDiscoveryError,
  type TmdbDiscoveryClientOptions,
  type TmdbDiscoveryErrorCode,
} from "./tmdb-discovery-client.ts";
import type { TmdbImageConfiguration } from "./tmdb-reference-normalization.ts";
import {
  fetchTmdbTitleDetails,
  type TmdbImageConfigurationSource,
  type TmdbTitleFetchJson,
} from "./tmdb-title-client.ts";
import {
  TMDB_TITLE_REQUEST_ERROR_MESSAGE,
  TmdbTitleRequestError,
} from "./tmdb-title-requests.ts";

const TEST_TOKEN = "unit-test-token-that-is-never-a-real-credential";

const IMAGE_CONFIGURATION = {
  baseUrl: "http://image.tmdb.org/t/p/",
  secureBaseUrl: "https://image.tmdb.org/t/p/",
  backdropSizes: ["w300", "w1280", "original"],
  logoSizes: ["w45", "w92", "original"],
  posterSizes: ["w92", "w500", "original"],
  profileSizes: ["w45", "original"],
  stillSizes: ["w92", "original"],
} as const satisfies TmdbImageConfiguration;

function isSafeClientError(
  error: unknown,
  code: TmdbDiscoveryErrorCode,
  unsafeValue?: string,
): boolean {
  return (
    error instanceof TmdbDiscoveryError &&
    error.code === code &&
    (unsafeValue === undefined || !error.message.includes(unsafeValue))
  );
}

test("fetches movie details first and returns normalized enrichment", async () => {
  const observedPaths: string[] = [];
  const observedOptions: TmdbDiscoveryClientOptions[] = [];
  let detailsCompleted = false;
  let configurationCalls = 0;
  const fetchImpl: typeof globalThis.fetch = async () => new Response();

  const fetchJson: TmdbTitleFetchJson = async (
    pathname,
    _searchParameters,
    options,
  ) => {
    observedPaths.push(pathname);
    observedOptions.push(options);

    if (pathname === "/movie/550") {
      detailsCompleted = true;
      return {
        id: 550,
        title: "Fight Club",
        original_title: "Fight Club",
        release_date: "1999-10-15",
        runtime: 139,
        genres: [{ id: 18, name: "Drama" }],
        poster_path: "/poster.jpg",
      };
    }

    assert.equal(detailsCompleted, true);

    if (pathname === "/movie/550/images") {
      return { id: 550, backdrops: [], posters: [] };
    }

    if (pathname === "/movie/550/videos") {
      return {
        id: 550,
        results: [
          {
            key: "official-trailer",
            official: true,
            site: "YouTube",
            type: "Trailer",
          },
        ],
      };
    }

    if (pathname === "/movie/550/watch/providers") {
      return {
        id: 550,
        results: {
          US: {
            link: "https://www.themoviedb.org/movie/550/watch?locale=US",
            flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
          },
        },
      };
    }

    throw new Error("unexpected test pathname");
  };
  const imageConfigurationSource: TmdbImageConfigurationSource = {
    async getImageConfiguration() {
      configurationCalls += 1;
      assert.equal(detailsCompleted, true);
      return IMAGE_CONFIGURATION;
    },
  };

  const details = await fetchTmdbTitleDetails("movie", 550, {
    language: "EN-us",
    watchRegion: "us",
    token: TEST_TOKEN,
    fetchImpl,
    timeoutMs: 321,
    fetchJson,
    imageConfigurationSource,
  });

  assert.deepEqual(observedPaths, [
    "/movie/550",
    "/movie/550/images",
    "/movie/550/videos",
    "/movie/550/watch/providers",
  ]);
  assert.equal(configurationCalls, 1);
  assert.equal(observedOptions.length, 4);

  for (const options of observedOptions) {
    assert.equal(options.token, TEST_TOKEN);
    assert.equal(options.fetchImpl, fetchImpl);
    assert.equal(options.timeoutMs, 321);
  }

  assert.equal(details.mediaType, "movie");
  assert.equal(details.id, 550);
  assert.equal(details.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(
    details.trailerUrl,
    "https://www.youtube.com/watch?v=official-trailer",
  );
  assert.equal(details.providerAvailability?.watchRegion, "US");
  assert.equal(details.providerAvailability?.streaming[0]?.name, "Netflix");
});

test("uses TV endpoints and skips provider retrieval without a region", async () => {
  const observedPaths: string[] = [];
  const fetchJson: TmdbTitleFetchJson = async (pathname) => {
    observedPaths.push(pathname);

    if (pathname === "/tv/1396") {
      return { id: 1396, name: "Breaking Bad", episode_run_time: [47] };
    }

    if (pathname === "/tv/1396/images") {
      return { id: 1396, backdrops: [], posters: [] };
    }

    if (pathname === "/tv/1396/videos") {
      return { id: 1396, results: [] };
    }

    throw new Error("provider retrieval must not be planned");
  };

  const details = await fetchTmdbTitleDetails("tv", 1396, {
    fetchJson,
    imageConfigurationSource: {
      async getImageConfiguration() {
        return IMAGE_CONFIGURATION;
      },
    },
  });

  assert.deepEqual(observedPaths, [
    "/tv/1396",
    "/tv/1396/images",
    "/tv/1396/videos",
  ]);
  assert.deepEqual(details.runtime, { kind: "episode", minutes: 47 });
  assert.equal(details.providerAvailability, null);
});

test("rejects invalid identity values before any retrieval", async () => {
  let fetchCalls = 0;
  let configurationCalls = 0;
  const unsafeValue = "private-invalid-media-type";

  await assert.rejects(
    fetchTmdbTitleDetails(unsafeValue as MediaSummary["mediaType"], 1, {
      fetchJson: async () => {
        fetchCalls += 1;
        return {};
      },
      imageConfigurationSource: {
        async getImageConfiguration() {
          configurationCalls += 1;
          return IMAGE_CONFIGURATION;
        },
      },
    }),
    (error) =>
      error instanceof TmdbTitleRequestError &&
      error.message === TMDB_TITLE_REQUEST_ERROR_MESSAGE &&
      !error.message.includes(unsafeValue),
  );

  assert.equal(fetchCalls, 0);
  assert.equal(configurationCalls, 0);
});

test("stops after a missing title response", async () => {
  const observedPaths: string[] = [];
  let configurationCalls = 0;

  await assert.rejects(
    fetchTmdbTitleDetails("movie", 999_999_999, {
      fetchJson: async (pathname) => {
        observedPaths.push(pathname);
        throw new TmdbDiscoveryError("NOT_FOUND", 404);
      },
      imageConfigurationSource: {
        async getImageConfiguration() {
          configurationCalls += 1;
          return IMAGE_CONFIGURATION;
        },
      },
    }),
    (error) => isSafeClientError(error, "NOT_FOUND"),
  );

  assert.deepEqual(observedPaths, ["/movie/999999999"]);
  assert.equal(configurationCalls, 0);
});

test("maps unexpected auxiliary failures without reflecting details", async () => {
  const unsafeValue = "private-upstream-failure-detail";

  await assert.rejects(
    fetchTmdbTitleDetails("movie", 7, {
      fetchJson: async (pathname) => {
        if (pathname === "/movie/7") {
          return { id: 7, title: "Movie" };
        }

        if (pathname.endsWith("/images")) {
          throw new Error(unsafeValue);
        }

        return { id: 7, results: [] };
      },
      imageConfigurationSource: {
        async getImageConfiguration() {
          return IMAGE_CONFIGURATION;
        },
      },
    }),
    (error) => isSafeClientError(error, "UPSTREAM_ERROR", unsafeValue),
  );
});

test("maps malformed enrichment payloads to a fixed invalid-response error", async () => {
  const unsafeValue = "private-malformed-response-value";

  await assert.rejects(
    fetchTmdbTitleDetails("movie", 7, {
      fetchJson: async (pathname) => {
        if (pathname === "/movie/7") {
          return { id: 7, title: "Movie" };
        }

        if (pathname.endsWith("/images")) {
          return { id: 7, posters: unsafeValue };
        }

        return { id: 7, results: [] };
      },
      imageConfigurationSource: {
        async getImageConfiguration() {
          return IMAGE_CONFIGURATION;
        },
      },
    }),
    (error) => isSafeClientError(error, "INVALID_RESPONSE", unsafeValue),
  );
});
