import assert from "node:assert/strict";
import test from "node:test";

import type { TmdbDiscoverySource } from "./tmdb-discovery-candidates.ts";
import {
  createTmdbDiscoveryRequestPlans,
  type TmdbDiscoveryRequestPlan,
} from "./tmdb-discovery-requests.ts";

function requiredPlan(
  plans: readonly TmdbDiscoveryRequestPlan[],
  source: TmdbDiscoverySource,
): TmdbDiscoveryRequestPlan {
  const plan = plans.find((candidatePlan) => candidatePlan.source === source);
  assert.ok(plan);
  return plan;
}

test("creates movie discovery, weekly trending, and now-playing plans", () => {
  const plans = createTmdbDiscoveryRequestPlans({
    hardRestrictions: { mediaType: "movie" },
  });

  assert.deepEqual(
    plans.map(({ source, mediaType, pathname }) => ({
      source,
      mediaType,
      pathname,
    })),
    [
      {
        source: "discover-movie",
        mediaType: "movie",
        pathname: "/discover/movie",
      },
      {
        source: "trending-movie-week",
        mediaType: "movie",
        pathname: "/trending/movie/week",
      },
      {
        source: "now-playing",
        mediaType: "movie",
        pathname: "/movie/now_playing",
      },
    ],
  );

  assert.deepEqual(requiredPlan(plans, "discover-movie").searchParameters, {
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    page: "1",
    sort_by: "popularity.desc",
  });
  assert.deepEqual(
    requiredPlan(plans, "trending-movie-week").searchParameters,
    { language: "en-US" },
  );
  assert.deepEqual(requiredPlan(plans, "now-playing").searchParameters, {
    language: "en-US",
    page: "1",
  });
  assert.equal(
    plans.every(
      (plan) =>
        !plan.appliedMaximumRuntimeRestriction &&
        !plan.appliedProviderRestriction,
    ),
    true,
  );
});

test("selects TV-only or both media request groups", () => {
  const tvPlans = createTmdbDiscoveryRequestPlans({
    hardRestrictions: { mediaType: "tv" },
  });
  const eitherPlans = createTmdbDiscoveryRequestPlans({
    hardRestrictions: { mediaType: "either" },
  });
  const broadPlans = createTmdbDiscoveryRequestPlans({});

  assert.deepEqual(
    tvPlans.map(({ source }) => source),
    ["discover-tv", "trending-tv-week", "on-the-air"],
  );
  assert.equal(
    requiredPlan(tvPlans, "discover-tv").searchParameters.include_adult,
    "false",
  );
  assert.equal(
    requiredPlan(tvPlans, "discover-tv").searchParameters
      .include_null_first_air_dates,
    "false",
  );

  const expectedBothSources = [
    "discover-movie",
    "trending-movie-week",
    "now-playing",
    "discover-tv",
    "trending-tv-week",
    "on-the-air",
  ];

  assert.deepEqual(
    eitherPlans.map(({ source }) => source),
    expectedBothSources,
  );
  assert.deepEqual(
    broadPlans.map(({ source }) => source),
    expectedBothSources,
  );
});

test("maps hard filters and applies any-provider OR semantics", () => {
  const plans = createTmdbDiscoveryRequestPlans({
    hardRestrictions: {
      mediaType: "either",
      excludedGenreIds: [27, 99],
      maximumRuntimeMinutes: 120,
      requiredProviderIds: [8, 337],
    },
    watchRegion: "US",
  });

  const movieDiscover = requiredPlan(plans, "discover-movie");
  const tvDiscover = requiredPlan(plans, "discover-tv");

  for (const discoverPlan of [movieDiscover, tvDiscover]) {
    assert.equal(discoverPlan.searchParameters.without_genres, "27|99");
    assert.equal(discoverPlan.searchParameters["with_runtime.lte"], "120");
    assert.equal(discoverPlan.searchParameters.watch_region, "US");
    assert.equal(discoverPlan.searchParameters.with_watch_providers, "8|337");
    assert.equal(discoverPlan.appliedMaximumRuntimeRestriction, true);
    assert.equal(discoverPlan.appliedProviderRestriction, true);
  }

  assert.equal(movieDiscover.searchParameters.region, "US");
  assert.equal(tvDiscover.searchParameters.region, undefined);
  assert.equal(
    requiredPlan(plans, "now-playing").searchParameters.region,
    "US",
  );
  assert.equal(
    requiredPlan(plans, "on-the-air").searchParameters.region,
    undefined,
  );

  const supplementalPlans = plans.filter(
    ({ source }) => source !== "discover-movie" && source !== "discover-tv",
  );

  for (const supplementalPlan of supplementalPlans) {
    assert.equal(
      supplementalPlan.searchParameters["with_runtime.lte"],
      undefined,
    );
    assert.equal(
      supplementalPlan.searchParameters.with_watch_providers,
      undefined,
    );
    assert.equal(supplementalPlan.appliedMaximumRuntimeRestriction, false);
    assert.equal(supplementalPlan.appliedProviderRestriction, false);
  }
});

test("uses soft signals only to shape discovery requests", () => {
  const plans = createTmdbDiscoveryRequestPlans({
    hardRestrictions: { mediaType: "movie" },
    softPreferences: {
      preferredGenreIds: [35, 18],
      contentLanguage: "ko",
      originCountry: "KR",
    },
  });

  const discoverPlan = requiredPlan(plans, "discover-movie");

  assert.equal(discoverPlan.searchParameters.with_genres, "35|18");
  assert.equal(discoverPlan.searchParameters.with_original_language, "ko");
  assert.equal(discoverPlan.searchParameters.with_origin_country, "KR");

  for (const source of ["trending-movie-week", "now-playing"] as const) {
    const supplementalPlan = requiredPlan(plans, source);
    assert.equal(supplementalPlan.searchParameters.with_genres, undefined);
    assert.equal(
      supplementalPlan.searchParameters.with_original_language,
      undefined,
    );
    assert.equal(
      supplementalPlan.searchParameters.with_origin_country,
      undefined,
    );
  }
});
