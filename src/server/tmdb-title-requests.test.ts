import assert from "node:assert/strict";
import test from "node:test";

import type { MediaSummary } from "../shared/media-contracts.ts";
import {
  createTmdbTitleRequestPlans,
  DEFAULT_TMDB_TITLE_LANGUAGE,
  TMDB_TITLE_REQUEST_ERROR_MESSAGE,
  TmdbTitleRequestError,
} from "./tmdb-title-requests.ts";

function isFixedRequestError(error: unknown): boolean {
  return (
    error instanceof TmdbTitleRequestError &&
    error.message === TMDB_TITLE_REQUEST_ERROR_MESSAGE
  );
}

test("plans every movie title endpoint with canonical request values", () => {
  const plans = createTmdbTitleRequestPlans("movie", 550, {
    language: "EN-us",
    watchRegion: " us ",
  });

  assert.deepEqual(plans, {
    mediaType: "movie",
    id: 550,
    language: "en-US",
    watchRegion: "US",
    details: {
      kind: "details",
      mediaType: "movie",
      id: 550,
      pathname: "/movie/550",
      searchParameters: { language: "en-US" },
    },
    images: {
      kind: "images",
      mediaType: "movie",
      id: 550,
      pathname: "/movie/550/images",
      searchParameters: {
        language: "en-US",
        include_image_language: "en-US,null",
      },
    },
    videos: {
      kind: "videos",
      mediaType: "movie",
      id: 550,
      pathname: "/movie/550/videos",
      searchParameters: { language: "en-US" },
    },
    watchProviders: {
      kind: "watch-providers",
      mediaType: "movie",
      id: 550,
      pathname: "/movie/550/watch/providers",
      searchParameters: {},
    },
  });
});

test("plans television endpoints and omits provider retrieval without a region", () => {
  const plans = createTmdbTitleRequestPlans("tv", 1396, {
    language: "fr",
  });

  assert.equal(plans.language, "fr");
  assert.equal(plans.watchRegion, null);
  assert.equal(plans.details.pathname, "/tv/1396");
  assert.deepEqual(plans.details.searchParameters, { language: "fr" });
  assert.equal(plans.images.pathname, "/tv/1396/images");
  assert.deepEqual(plans.images.searchParameters, {
    language: "fr",
    include_image_language: "fr,null",
  });
  assert.equal(plans.videos.pathname, "/tv/1396/videos");
  assert.deepEqual(plans.videos.searchParameters, { language: "fr" });
  assert.equal(plans.watchProviders, null);
});

test("uses the documented response-language default", () => {
  const plans = createTmdbTitleRequestPlans("movie", 1);

  assert.equal(plans.language, DEFAULT_TMDB_TITLE_LANGUAGE);
  assert.deepEqual(plans.details.searchParameters, {
    language: DEFAULT_TMDB_TITLE_LANGUAGE,
  });
});

test("rejects unsafe media types, IDs, languages, and regions", () => {
  const unsafeValue = "private-invalid-request-value";
  const invalidCalls: readonly (() => unknown)[] = [
    () =>
      createTmdbTitleRequestPlans(unsafeValue as MediaSummary["mediaType"], 1),
    () => createTmdbTitleRequestPlans("movie", 0),
    () => createTmdbTitleRequestPlans("movie", 1.5),
    () => createTmdbTitleRequestPlans("movie", Number.MAX_SAFE_INTEGER + 1),
    () => createTmdbTitleRequestPlans("movie", 1, { language: unsafeValue }),
    () => createTmdbTitleRequestPlans("movie", 1, { watchRegion: unsafeValue }),
  ];

  for (const invalidCall of invalidCalls) {
    assert.throws(invalidCall, (error: unknown) => {
      assert.equal(isFixedRequestError(error), true);
      assert.equal((error as Error).message.includes(unsafeValue), false);
      return true;
    });
  }
});
