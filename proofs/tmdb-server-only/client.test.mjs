import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchPopularMovie,
  normalizeMovie,
  TmdbProofError,
} from "./client.mjs";

const TEST_TOKEN = "test-token-value-that-is-never-a-real-credential";
const TMDB_MOVIE = {
  adult: false,
  backdrop_path: "/backdrop.jpg",
  genre_ids: [18, 35, "invalid"],
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
  unexpected_private_field: "must not cross the normalization boundary",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("normalizeMovie returns only the explicit PickTonight fields", () => {
  assert.deepEqual(normalizeMovie(TMDB_MOVIE), {
    source: "tmdb",
    mediaType: "movie",
    id: 123,
    title: "Localized title",
    originalTitle: "Original title",
    overview: "A source-backed overview.",
    releaseDate: "2026-08-01",
    originalLanguage: "ko",
    genreIds: [18, 35],
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    popularity: 88.4,
    voteAverage: 7.8,
    voteCount: 421,
    adult: false,
  });
});

test("fetchPopularMovie sends a server-side Bearer header and normalizes one result", async () => {
  let observedUrl;
  let observedOptions;

  const movie = await fetchPopularMovie({
    token: TEST_TOKEN,
    fetchImpl: async (url, options) => {
      observedUrl = url;
      observedOptions = options;
      return jsonResponse({ results: [TMDB_MOVIE] });
    },
  });

  assert.equal(observedUrl.origin, "https://api.themoviedb.org");
  assert.equal(observedUrl.pathname, "/3/movie/popular");
  assert.equal(observedUrl.searchParams.get("language"), "en-US");
  assert.equal(observedUrl.searchParams.get("page"), "1");
  assert.equal(observedUrl.searchParams.get("region"), "US");
  assert.equal(observedOptions.headers.Authorization, `Bearer ${TEST_TOKEN}`);
  assert.equal(JSON.stringify(movie).includes(TEST_TOKEN), false);
  assert.equal(movie.id, TMDB_MOVIE.id);
});

test("fetchPopularMovie rejects missing server configuration before requesting TMDB", async () => {
  let requestMade = false;

  await assert.rejects(
    fetchPopularMovie({
      token: "",
      fetchImpl: async () => {
        requestMade = true;
        return jsonResponse({ results: [TMDB_MOVIE] });
      },
    }),
    (error) =>
      error instanceof TmdbProofError &&
      error.code === "CONFIGURATION_ERROR" &&
      !error.message.includes(TEST_TOKEN),
  );

  assert.equal(requestMade, false);
});

test("fetchPopularMovie returns a friendly authentication error", async () => {
  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: async () => jsonResponse({ status_message: "Invalid key" }, 401),
    }),
    (error) =>
      error instanceof TmdbProofError &&
      error.code === "AUTHENTICATION_ERROR" &&
      error.status === 401 &&
      !error.message.includes(TEST_TOKEN),
  );
});

test("fetchPopularMovie returns a friendly upstream error", async () => {
  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: async () => jsonResponse({}, 503),
    }),
    (error) =>
      error instanceof TmdbProofError &&
      error.code === "UPSTREAM_ERROR" &&
      error.status === 503,
  );
});

test("fetchPopularMovie rejects an unreadable TMDB payload", async () => {
  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: async () =>
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    }),
    (error) =>
      error instanceof TmdbProofError && error.code === "INVALID_RESPONSE",
  );
});

test("fetchPopularMovie distinguishes an empty result set", async () => {
  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: async () => jsonResponse({ results: [] }),
    }),
    (error) =>
      error instanceof TmdbProofError && error.code === "NO_RESULTS",
  );
});

test("fetchPopularMovie aborts a slow upstream request", async () => {
  const neverResponds = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: neverResponds,
      timeoutMs: 5,
    }),
    (error) =>
      error instanceof TmdbProofError && error.code === "UPSTREAM_TIMEOUT",
  );
});

test("fetchPopularMovie distinguishes a network failure", async () => {
  await assert.rejects(
    fetchPopularMovie({
      token: TEST_TOKEN,
      fetchImpl: async () => {
        throw new TypeError("network failed");
      },
    }),
    (error) =>
      error instanceof TmdbProofError && error.code === "NETWORK_ERROR",
  );
});
