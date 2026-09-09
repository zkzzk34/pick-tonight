import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTmdbDiscoveryBatch,
  TmdbDiscoveryError,
  type TmdbDiscoveryErrorCode,
} from "./tmdb-discovery-client.ts";
import type { TmdbDiscoveryRequestPlan } from "./tmdb-discovery-requests.ts";

const TEST_TOKEN = "unit-test-token-that-is-never-a-real-credential";

const MOVIE_PLAN = {
  source: "discover-movie",
  mediaType: "movie",
  pathname: "/discover/movie",
  searchParameters: {
    include_adult: "false",
    language: "en-US",
    page: "1",
    with_watch_providers: "8|337",
    watch_region: "US",
  },
  appliedMaximumRuntimeRestriction: false,
  appliedProviderRestriction: true,
} as const satisfies TmdbDiscoveryRequestPlan;

const TV_PLAN = {
  source: "trending-tv-week",
  mediaType: "tv",
  pathname: "/trending/tv/week",
  searchParameters: {
    language: "en-US",
  },
  appliedMaximumRuntimeRestriction: false,
  appliedProviderRestriction: false,
} as const satisfies TmdbDiscoveryRequestPlan;

const TMDB_MOVIE = {
  adult: false,
  backdrop_path: "/backdrop.jpg",
  genre_ids: [18, 35],
  id: 123,
  original_language: "ko",
  original_title: "Original title",
  overview: "A source-backed overview.",
  popularity: 88.4,
  poster_path: "/poster.jpg",
  release_date: "2026-08-01",
  title: "Localized title",
  vote_average: 7.8,
  vote_count: 421,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isSafeDiscoveryError(
  error: unknown,
  code: TmdbDiscoveryErrorCode,
  status?: number,
): boolean {
  return (
    error instanceof TmdbDiscoveryError &&
    error.code === code &&
    (status === undefined || error.status === status) &&
    !error.message.includes(TEST_TOKEN) &&
    !JSON.stringify(error).includes(TEST_TOKEN)
  );
}

test("sends one server-side request and returns a normalized batch", async () => {
  let observedUrl: URL | undefined;
  let observedOptions: RequestInit | undefined;

  const batch = await fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
    token: TEST_TOKEN,
    fetchImpl: async (input, options) => {
      observedUrl = new URL(String(input));
      observedOptions = options;
      return jsonResponse({ page: 1, results: [TMDB_MOVIE] });
    },
  });

  assert.ok(observedUrl);
  assert.equal(observedUrl.origin, "https://api.themoviedb.org");
  assert.equal(observedUrl.pathname, "/3/discover/movie");
  assert.equal(observedUrl.searchParams.get("include_adult"), "false");
  assert.equal(observedUrl.searchParams.get("with_watch_providers"), "8|337");
  assert.equal(observedUrl.searchParams.get("watch_region"), "US");
  assert.equal(observedUrl.searchParams.has("api_key"), false);
  assert.equal(observedUrl.href.includes(TEST_TOKEN), false);

  const observedHeaders = new Headers(observedOptions?.headers);
  assert.equal(observedHeaders.get("Authorization"), `Bearer ${TEST_TOKEN}`);

  assert.equal(batch.source, "discover-movie");
  assert.equal(batch.mediaType, "movie");
  assert.equal(batch.appliedProviderRestriction, true);
  assert.equal(batch.candidates.length, 1);
  assert.equal(batch.candidates[0]?.id, 123);
  assert.equal(batch.candidates[0]?.mediaType, "movie");
  assert.equal(batch.candidates[0]?.title, "Localized title");
  assert.equal(JSON.stringify(batch).includes(TEST_TOKEN), false);
});

test("normalizes valid TV results and skips unusable individual items", async () => {
  const batch = await fetchTmdbDiscoveryBatch(TV_PLAN, {
    token: TEST_TOKEN,
    fetchImpl: async () =>
      jsonResponse({
        results: [
          null,
          { id: -1, name: "Invalid identity" },
          {
            id: 456,
            name: "Valid television",
            original_name: "Original television",
            first_air_date: "2026-09-01",
            genre_ids: [18],
            adult: false,
          },
        ],
      }),
  });

  assert.equal(batch.candidates.length, 1);
  assert.equal(batch.candidates[0]?.id, 456);
  assert.equal(batch.candidates[0]?.mediaType, "tv");
  assert.equal(batch.candidates[0]?.title, "Valid television");
});

test("accepts a legitimate empty result array", async () => {
  const batch = await fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
    token: TEST_TOKEN,
    fetchImpl: async () => jsonResponse({ page: 1, results: [] }),
  });

  assert.deepEqual(batch.candidates, []);
});

test("rejects unsafe server configuration before making a request", async () => {
  let requestMade = false;

  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: " ",
      fetchImpl: async () => {
        requestMade = true;
        return jsonResponse({ results: [TMDB_MOVIE] });
      },
    }),
    (error) => isSafeDiscoveryError(error, "CONFIGURATION_ERROR"),
  );

  assert.equal(requestMade, false);
});

test("maps authentication failures without reflecting credentials", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
        token: TEST_TOKEN,
        fetchImpl: async () =>
          jsonResponse({ status_message: TEST_TOKEN }, status),
      }),
      (error) => isSafeDiscoveryError(error, "AUTHENTICATION_ERROR", status),
    );
  }
});

test("maps TMDB rate limiting to a fixed safe error", async () => {
  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: TEST_TOKEN,
      fetchImpl: async () => jsonResponse({ status_message: TEST_TOKEN }, 429),
    }),
    (error) => isSafeDiscoveryError(error, "RATE_LIMIT_ERROR", 429),
  );
});

test("distinguishes upstream failures and upstream HTTP timeouts", async () => {
  const cases = [
    [503, "UPSTREAM_ERROR"],
    [504, "UPSTREAM_TIMEOUT"],
  ] as const;

  for (const [status, code] of cases) {
    await assert.rejects(
      fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
        token: TEST_TOKEN,
        fetchImpl: async () =>
          jsonResponse({ status_message: TEST_TOKEN }, status),
      }),
      (error) => isSafeDiscoveryError(error, code, status),
    );
  }
});

test("rejects unreadable and malformed top-level payloads", async () => {
  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: TEST_TOKEN,
      fetchImpl: async () =>
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    }),
    (error) => isSafeDiscoveryError(error, "INVALID_RESPONSE", 200),
  );

  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: TEST_TOKEN,
      fetchImpl: async () => jsonResponse({ results: "not-an-array" }),
    }),
    (error) => isSafeDiscoveryError(error, "INVALID_RESPONSE"),
  );
});

test("aborts slow requests and distinguishes network failures", async () => {
  const neverResponds: typeof globalThis.fetch = (_input, options) =>
    new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: TEST_TOKEN,
      fetchImpl: neverResponds,
      timeoutMs: 5,
    }),
    (error) => isSafeDiscoveryError(error, "UPSTREAM_TIMEOUT"),
  );

  await assert.rejects(
    fetchTmdbDiscoveryBatch(MOVIE_PLAN, {
      token: TEST_TOKEN,
      fetchImpl: async () => {
        throw new TypeError(`network failure ${TEST_TOKEN}`);
      },
    }),
    (error) => isSafeDiscoveryError(error, "NETWORK_ERROR"),
  );
});
