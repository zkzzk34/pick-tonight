import assert from "node:assert/strict";
import test from "node:test";

import * as z from "zod";

import {
  createRecommendationResponseSchema,
  invalidRecommendationRequestResponseSchema,
  recommendationRequestSchema,
  type InvalidRecommendationRequestResponse,
  type RecommendationRequest,
  type RecommendationResponse,
} from "../shared/recommendation-contracts.ts";

function assertRequestRejected(value: unknown): void {
  assert.equal(recommendationRequestSchema.safeParse(value).success, false);
}

test("recommendation requests accept broad and fully reviewed preferences", () => {
  const broad: RecommendationRequest = recommendationRequestSchema.parse({});
  assert.deepEqual(broad, {});

  const reviewedInput = {
    hardRestrictions: {
      mediaType: "movie",
      excludedGenreIds: [27, 53],
      maximumRuntimeMinutes: 120,
      requiredProviderIds: [8, 337],
    },
    softPreferences: {
      mood: "relaxed",
      preferredGenreIds: [18, 35],
      contentLanguage: "en",
      originCountry: "US",
    },
    watchRegion: "US",
  };

  const reviewed: RecommendationRequest =
    recommendationRequestSchema.parse(reviewedInput);

  assert.deepEqual(reviewed, reviewedInput);
});

test("recommendation requests reject missing and non-object values", () => {
  for (const value of [undefined, null, [], "movie", 42]) {
    assertRequestRejected(value);
  }
});

test("recommendation requests reject malformed and unsupported fields", () => {
  const invalidRequests: unknown[] = [
    { hardRestrictions: { mediaType: "documentary" } },
    { softPreferences: { mood: "intense" } },
    { hardRestrictions: { maximumRuntimeMinutes: 90.5 } },
    { hardRestrictions: { maximumRuntimeMinutes: "90" } },
    { watchRegion: "usa" },
    { softPreferences: { contentLanguage: "EN" } },
    { softPreferences: { originCountry: "us" } },
  ];

  for (const request of invalidRequests) {
    assertRequestRejected(request);
  }
});

test("recommendation requests reject unsafe identifier lists", () => {
  const tooManyIds = Array.from({ length: 51 }, (_, index) => index + 1);
  const invalidRequests: unknown[] = [
    { hardRestrictions: { excludedGenreIds: [0] } },
    { hardRestrictions: { excludedGenreIds: [-1] } },
    { hardRestrictions: { excludedGenreIds: [1.5] } },
    { hardRestrictions: { excludedGenreIds: [12, 12] } },
    { softPreferences: { preferredGenreIds: tooManyIds } },
    { hardRestrictions: { requiredProviderIds: [] }, watchRegion: "US" },
  ];

  for (const request of invalidRequests) {
    assertRequestRejected(request);
  }
});

test("provider restrictions require a separate watch region", () => {
  assertRequestRejected({
    hardRestrictions: { requiredProviderIds: [8] },
  });

  assert.equal(
    recommendationRequestSchema.safeParse({
      hardRestrictions: { requiredProviderIds: [8] },
      watchRegion: "US",
    }).success,
    true,
  );
});

test("strict request schemas reject unknown and deferred fields", () => {
  const invalidRequests: unknown[] = [
    { rawText: "private free-form input" },
    { freshness: "recent" },
    { softPreferences: { freshness: "recent" } },
    { softPreferences: { viewingCompanion: "family" } },
    { hardRestrictions: { minimumRating: 8 } },
  ];

  for (const request of invalidRequests) {
    assertRequestRejected(request);
  }
});

test("recommendation responses are strict and contain at most three items", () => {
  const itemSchema = z.strictObject({
    id: z.number().int().positive(),
    title: z.string().min(1),
  });
  const responseSchema = createRecommendationResponseSchema(itemSchema);

  const parsed: RecommendationResponse<typeof itemSchema> =
    responseSchema.parse({
      data: {
        recommendations: [
          { id: 1, title: "First" },
          { id: 2, title: "Second" },
          { id: 3, title: "Third" },
        ],
      },
    });

  assert.equal(parsed.data.recommendations.length, 3);
  assert.equal(
    responseSchema.safeParse({ data: { recommendations: [] } }).success,
    true,
  );

  const invalidResponses: unknown[] = [
    {
      data: {
        recommendations: [
          { id: 1, title: "First" },
          { id: 2, title: "Second" },
          { id: 3, title: "Third" },
          { id: 4, title: "Fourth" },
        ],
      },
    },
    { data: { recommendations: [], extra: true } },
    { data: { recommendations: [{ id: 1, title: "First", extra: true }] } },
    { data: { recommendations: [] }, extra: true },
  ];

  for (const response of invalidResponses) {
    assert.equal(responseSchema.safeParse(response).success, false);
  }
});

test("invalid requests use the shared structured error contract", () => {
  const payload = {
    error: {
      code: "INVALID_REQUEST",
      message: "The recommendation request is invalid.",
      issues: [
        {
          code: "UNKNOWN_FIELD",
          path: ["softPreferences"],
        },
      ],
    },
  };

  const parsed: InvalidRecommendationRequestResponse =
    invalidRecommendationRequestResponseSchema.parse(payload);

  assert.deepEqual(parsed, payload);

  const invalidResponses: unknown[] = [
    {
      error: {
        code: "INVALID_REQUEST",
        message: "The recommendation request is invalid.",
        issues: [],
      },
    },
    {
      error: {
        code: "BAD_REQUEST",
        message: "The recommendation request is invalid.",
        issues: [{ code: "INVALID_VALUE", path: [] }],
      },
    },
    {
      error: {
        code: "INVALID_REQUEST",
        message: "Unsafe detail",
        issues: [{ code: "INVALID_VALUE", path: [] }],
      },
    },
    { ...payload, debug: true },
  ];

  for (const response of invalidResponses) {
    assert.equal(
      invalidRecommendationRequestResponseSchema.safeParse(response).success,
      false,
    );
  }
});
