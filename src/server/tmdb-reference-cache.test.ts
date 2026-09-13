import assert from "node:assert/strict";
import test from "node:test";

import { fetchTmdbJson, TmdbDiscoveryError } from "./tmdb-discovery-client.ts";
import {
  DEFAULT_TMDB_REFERENCE_CACHE_TTL_MS,
  TmdbReferenceDataCache,
} from "./tmdb-reference-cache.ts";
import type { TmdbReferenceFetchJson } from "./tmdb-reference-cache.ts";

const TEST_TOKEN = "test-server-token";

const IMAGE_PAYLOAD = {
  images: {
    base_url: "http://image.tmdb.org/t/p/",
    secure_base_url: "https://image.tmdb.org/t/p/",
    backdrop_sizes: ["w300", "original"],
    logo_sizes: ["w45", "original"],
    poster_sizes: ["w92", "w500", "original"],
    profile_sizes: ["w45", "original"],
    still_sizes: ["w92", "original"],
  },
};

const GENRE_PAYLOAD = {
  genres: [{ id: 28, name: "Action" }],
};

const REGION_PAYLOAD = {
  results: [
    {
      iso_3166_1: "US",
      english_name: "United States of America",
      native_name: "United States",
    },
  ],
};

const PROVIDER_PAYLOAD = {
  results: [
    {
      provider_id: 8,
      provider_name: "Netflix",
      logo_path: "/netflix.jpg",
      display_priority: 0,
      display_priorities: { US: 0 },
    },
  ],
};

function assertTmdbError(
  code: TmdbDiscoveryError["code"],
): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof TmdbDiscoveryError);
    assert.equal(error.code, code);
    return true;
  };
}

test("shared TMDB transport sends bearer authentication without exposing it in the URL", async () => {
  const observation: {
    url: URL | null;
    init: RequestInit | null;
  } = {
    url: null,
    init: null,
  };

  const payload = await fetchTmdbJson(
    "/genre/movie/list",
    { language: "fr-CA" },
    {
      token: TEST_TOKEN,
      fetchImpl: async (input, init) => {
        observation.url = new URL(input.toString());
        observation.init = init ?? null;

        return new Response(JSON.stringify(GENRE_PAYLOAD), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );

  assert.deepEqual(payload, GENRE_PAYLOAD);

  const observedUrl = observation.url;
  const observedInit = observation.init;

  assert.ok(observedUrl !== null);
  assert.ok(observedInit !== null);
  assert.equal(observedUrl.origin, "https://api.themoviedb.org");
  assert.equal(observedUrl.pathname, "/3/genre/movie/list");
  assert.equal(observedUrl.searchParams.get("language"), "fr-CA");
  assert.equal(observedUrl.searchParams.has("api_key"), false);
  assert.equal(observedUrl.href.includes(TEST_TOKEN), false);
  assert.equal(observedInit.method, "GET");

  const headers = new Headers(observedInit.headers);

  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Authorization"), `Bearer ${TEST_TOKEN}`);
});

test("retrieves and normalizes every documented reference endpoint", async () => {
  const requests: Array<{
    pathname: string;
    searchParameters: Readonly<Record<string, string>>;
  }> = [];

  const fetchJson: TmdbReferenceFetchJson = async (
    pathname,
    searchParameters,
  ) => {
    requests.push({
      pathname,
      searchParameters: { ...searchParameters },
    });

    if (pathname === "/configuration") {
      return IMAGE_PAYLOAD;
    }

    if (pathname.startsWith("/genre/")) {
      return GENRE_PAYLOAD;
    }

    if (pathname === "/watch/providers/regions") {
      return REGION_PAYLOAD;
    }

    return PROVIDER_PAYLOAD;
  };

  const cache = new TmdbReferenceDataCache({
    fetchJson,
    now: () => 0,
  });

  const [images, movieGenres, tvGenres, regions, movieProviders, tvProviders] =
    await Promise.all([
      cache.getImageConfiguration(),
      cache.getGenres("movie"),
      cache.getGenres("tv", "fr-CA"),
      cache.getWatchProviderRegions(),
      cache.getWatchProviders("movie"),
      cache.getWatchProviders("tv", {
        language: "pt-br",
        watchRegion: "br",
      }),
    ]);

  assert.equal(images.secureBaseUrl, "https://image.tmdb.org/t/p/");
  assert.deepEqual(movieGenres, [{ id: 28, name: "Action" }]);
  assert.deepEqual(tvGenres, [{ id: 28, name: "Action" }]);
  assert.equal(regions[0]?.code, "US");
  assert.equal(movieProviders[0]?.id, 8);
  assert.equal(tvProviders[0]?.name, "Netflix");

  assert.deepEqual(requests, [
    {
      pathname: "/configuration",
      searchParameters: {},
    },
    {
      pathname: "/genre/movie/list",
      searchParameters: { language: "en" },
    },
    {
      pathname: "/genre/tv/list",
      searchParameters: { language: "fr-CA" },
    },
    {
      pathname: "/watch/providers/regions",
      searchParameters: { language: "en-US" },
    },
    {
      pathname: "/watch/providers/movie",
      searchParameters: { language: "en-US" },
    },
    {
      pathname: "/watch/providers/tv",
      searchParameters: {
        language: "pt-BR",
        watch_region: "BR",
      },
    },
  ]);
});

test("canonicalizes language and region values into dependency-complete cache keys", async () => {
  let requestCount = 0;

  const cache = new TmdbReferenceDataCache({
    now: () => 0,
    fetchJson: async (pathname) => {
      requestCount += 1;

      if (pathname.startsWith("/genre/")) {
        return GENRE_PAYLOAD;
      }

      if (pathname === "/watch/providers/regions") {
        return REGION_PAYLOAD;
      }

      return PROVIDER_PAYLOAD;
    },
  });

  await cache.getGenres("movie", " EN-us ");
  await cache.getGenres("movie", "en-US");
  await cache.getGenres("tv", "en-US");

  await cache.getWatchProviderRegions(" EN-us ");
  await cache.getWatchProviderRegions("en-US");
  await cache.getWatchProviderRegions("fr-FR");

  await cache.getWatchProviders("movie", {
    language: "EN-us",
    watchRegion: "us",
  });
  await cache.getWatchProviders("movie", {
    language: "en-US",
    watchRegion: "US",
  });
  await cache.getWatchProviders("tv", {
    language: "en-US",
    watchRegion: "US",
  });
  await cache.getWatchProviders("movie", {
    language: "en-US",
    watchRegion: "CA",
  });

  assert.equal(requestCount, 7);
});

test("serves hits before expiration and refreshes at the exact expiration time", async () => {
  let now = 1_000;
  let requestCount = 0;

  const cache = new TmdbReferenceDataCache({
    now: () => now,
    ttlMs: 100,
    fetchJson: async () => {
      requestCount += 1;

      return {
        genres: [
          {
            id: requestCount,
            name: `Generation ${requestCount}`,
          },
        ],
      };
    },
  });

  assert.equal((await cache.getGenres("movie"))[0]?.id, 1);

  now = 1_099;
  assert.equal((await cache.getGenres("movie"))[0]?.id, 1);
  assert.equal(requestCount, 1);

  now = 1_100;
  assert.equal((await cache.getGenres("movie"))[0]?.id, 2);
  assert.equal(requestCount, 2);
});

test("coalesces concurrent refreshes for the same cache key", async () => {
  let requestCount = 0;
  let releaseRequest: (() => void) | undefined;

  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  const cache = new TmdbReferenceDataCache({
    now: () => 0,
    fetchJson: async () => {
      requestCount += 1;
      await gate;
      return GENRE_PAYLOAD;
    },
  });

  const first = cache.getGenres("movie", "en");
  const second = cache.getGenres("movie", "EN");

  assert.equal(requestCount, 1);

  const release = releaseRequest;

  assert.ok(release !== undefined);
  release();

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(requestCount, 1);
});

test("does not serve stale data or cache a failed refresh", async () => {
  let now = 0;
  let requestCount = 0;
  const unsafeMessage = "upstream-secret-body";

  const cache = new TmdbReferenceDataCache({
    now: () => now,
    ttlMs: 10,
    fetchJson: async () => {
      requestCount += 1;

      if (requestCount === 2) {
        throw new TmdbDiscoveryError("NETWORK_ERROR");
      }

      return {
        genres: [
          {
            id: requestCount,
            name: requestCount === 1 ? "Initial" : "Recovered",
          },
        ],
      };
    },
  });

  assert.equal((await cache.getGenres("movie"))[0]?.name, "Initial");

  now = 10;

  await assert.rejects(
    cache.getGenres("movie"),
    assertTmdbError("NETWORK_ERROR"),
  );
  assert.equal(requestCount, 2);
  assert.equal((await cache.getGenres("movie"))[0]?.name, "Recovered");
  assert.equal(requestCount, 3);

  const unexpectedFailureCache = new TmdbReferenceDataCache({
    now: () => 0,
    fetchJson: async () => {
      throw new Error(unsafeMessage);
    },
  });

  await assert.rejects(
    unexpectedFailureCache.getGenres("movie"),
    (error: unknown) => {
      assert.ok(error instanceof TmdbDiscoveryError);
      assert.equal(error.code, "UPSTREAM_ERROR");
      assert.equal(error.message.includes(unsafeMessage), false);
      return true;
    },
  );
});

test("maps invalid upstream envelopes safely and does not cache them", async () => {
  let requestCount = 0;
  const unsafePayload = "sensitive-upstream-payload";

  const cache = new TmdbReferenceDataCache({
    now: () => 0,
    fetchJson: async () => {
      requestCount += 1;

      return requestCount === 1 ? { genres: unsafePayload } : GENRE_PAYLOAD;
    },
  });

  await assert.rejects(cache.getGenres("movie"), (error: unknown) => {
    assert.ok(error instanceof TmdbDiscoveryError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.equal(error.message.includes(unsafePayload), false);
    return true;
  });

  assert.deepEqual(await cache.getGenres("movie"), [
    { id: 28, name: "Action" },
  ]);
  assert.equal(requestCount, 2);
});

test("rejects invalid cache, clock, locale, region, and media configuration", async () => {
  assert.equal(DEFAULT_TMDB_REFERENCE_CACHE_TTL_MS, 86_400_000);

  for (const ttlMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => new TmdbReferenceDataCache({ ttlMs }),
      assertTmdbError("CONFIGURATION_ERROR"),
    );
  }

  assert.throws(
    () =>
      new TmdbReferenceDataCache({
        fetchJson: null as unknown as TmdbReferenceFetchJson,
      }),
    assertTmdbError("CONFIGURATION_ERROR"),
  );

  const invalidClockCache = new TmdbReferenceDataCache({
    now: () => Number.NaN,
    fetchJson: async () => GENRE_PAYLOAD,
  });

  await assert.rejects(
    invalidClockCache.getGenres("movie"),
    assertTmdbError("CONFIGURATION_ERROR"),
  );

  const validCache = new TmdbReferenceDataCache({
    now: () => 0,
    fetchJson: async () => GENRE_PAYLOAD,
  });

  for (const operation of [
    () => validCache.getGenres("film" as "movie"),
    () => validCache.getGenres("movie", "english"),
    () => validCache.getGenres("movie", "en_US"),
    () =>
      validCache.getWatchProviders("movie", {
        watchRegion: "USA",
      }),
  ]) {
    assert.throws(operation, assertTmdbError("CONFIGURATION_ERROR"));
  }
});
