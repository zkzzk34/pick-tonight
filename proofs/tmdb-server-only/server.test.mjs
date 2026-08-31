import assert from "node:assert/strict";
import test from "node:test";

import { startProofServer } from "./server.mjs";

const TEST_TOKEN = "test-token-value-that-is-never-a-real-credential";
const TMDB_MOVIE = {
  adult: false,
  backdrop_path: "/backdrop.jpg",
  genre_ids: [18],
  id: 123,
  original_language: "en",
  original_title: "Original title",
  overview: "A source-backed overview.",
  popularity: 88.4,
  poster_path: "/poster.jpg",
  release_date: "2026-08-01",
  title: "Localized title",
  vote_average: 7.8,
  vote_count: 421,
};

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("the browser boundary exposes only local assets and normalized data", async (t) => {
  let observedUpstreamRequest;
  const server = await startProofServer({
    port: 0,
    token: TEST_TOKEN,
    fetchImpl: async (url, options) => {
      observedUpstreamRequest = { url, options };
      return new Response(JSON.stringify({ results: [TMDB_MOVIE] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  t.after(() => closeServer(server));

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const pageResponse = await fetch(`${origin}/`);
  const pageSource = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.equal(pageSource.includes(TEST_TOKEN), false);
  assert.equal(pageSource.includes("TMDB_API_READ_TOKEN"), false);
  assert.equal(pageSource.includes("api.themoviedb.org"), false);
  assert.equal(pageSource.includes("Authorization"), false);

  const scriptResponse = await fetch(`${origin}/proof.js`);
  const scriptSource = await scriptResponse.text();
  assert.equal(scriptResponse.status, 200);
  assert.equal(scriptSource.includes(TEST_TOKEN), false);
  assert.equal(scriptSource.includes("api.themoviedb.org"), false);
  assert.equal(scriptSource.includes("Authorization"), false);

  const apiResponse = await fetch(`${origin}/api/tmdb-proof`);
  const apiText = await apiResponse.text();
  const apiPayload = JSON.parse(apiText);
  assert.equal(apiResponse.status, 200);
  assert.equal(apiText.includes(TEST_TOKEN), false);
  assert.equal(apiPayload.movie.id, TMDB_MOVIE.id);
  assert.deepEqual(Object.keys(apiPayload), ["movie"]);

  assert.equal(
    observedUpstreamRequest.options.headers.Authorization,
    `Bearer ${TEST_TOKEN}`,
  );
  assert.equal(
    observedUpstreamRequest.url.origin,
    "https://api.themoviedb.org",
  );

  const envResponse = await fetch(`${origin}/.env`);
  const envText = await envResponse.text();
  assert.equal(envResponse.status, 404);
  assert.equal(envText.includes(TEST_TOKEN), false);
});

test("the local endpoint returns a sanitized authentication failure", async (t) => {
  const server = await startProofServer({
    port: 0,
    token: TEST_TOKEN,
    fetchImpl: async () =>
      new Response(JSON.stringify({ status_message: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  });
  t.after(() => closeServer(server));

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/tmdb-proof`,
  );
  const responseText = await response.text();
  const payload = JSON.parse(responseText);

  assert.equal(response.status, 502);
  assert.equal(payload.error.code, "AUTHENTICATION_ERROR");
  assert.equal(responseText.includes(TEST_TOKEN), false);
  assert.equal(responseText.includes("Invalid token"), false);
});
