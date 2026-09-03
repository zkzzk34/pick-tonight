import assert from "node:assert/strict";
import test from "node:test";

import {
  readTmdbApiReadToken,
  ServerConfigurationError,
} from "./environment.ts";

test("server configuration accepts one raw TMDB token", () => {
  const token = "test-token-value-that-is-never-a-real-credential";

  assert.equal(readTmdbApiReadToken({ TMDB_API_READ_TOKEN: token }), token);
});

test("server configuration rejects unsafe TMDB token forms without reflecting them", () => {
  const invalidValues = [
    undefined,
    "",
    "replace_with_your_tmdb_api_read_access_token",
    "Bearer should-not-be-included",
    "token with spaces",
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => readTmdbApiReadToken({ TMDB_API_READ_TOKEN: value }),
      (error) =>
        error instanceof ServerConfigurationError &&
        error.message === "TMDB access is not configured on the server." &&
        (value === undefined || value === "" || !error.message.includes(value)),
    );
  }
});
