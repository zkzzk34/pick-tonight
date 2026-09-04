import assert from "node:assert/strict";
import test from "node:test";

import {
  invalidRecommendationRequestResponseSchema,
  type InvalidRecommendationRequestResponse,
  type RequestValidationIssue,
} from "../shared/recommendation-contracts.ts";
import {
  parseRecommendationRequestBody,
  type RecommendationRequestBodyParseResult,
} from "./recommendation-request.ts";

function failureResponse(
  result: RecommendationRequestBodyParseResult,
): InvalidRecommendationRequestResponse {
  assert.equal(result.success, false);

  if (result.success) {
    throw new Error("expected request parsing to fail");
  }

  assert.equal(
    invalidRecommendationRequestResponseSchema.safeParse(result.response)
      .success,
    true,
  );

  return result.response;
}

function expectFailure(
  body: string | undefined,
  issues: RequestValidationIssue[],
): InvalidRecommendationRequestResponse {
  const response = failureResponse(parseRecommendationRequestBody(body));

  assert.deepEqual(response, {
    error: {
      code: "INVALID_REQUEST",
      message: "The recommendation request is invalid.",
      issues,
    },
  });

  return response;
}

test("parses valid broad and fully reviewed request bodies", () => {
  assert.deepEqual(parseRecommendationRequestBody("  {}  "), {
    success: true,
    data: {},
  });

  const reviewedRequest = {
    hardRestrictions: {
      mediaType: "either",
      excludedGenreIds: [27],
      maximumRuntimeMinutes: 120,
      requiredProviderIds: [8],
    },
    softPreferences: {
      mood: "thoughtful",
      preferredGenreIds: [18],
      contentLanguage: "en",
      originCountry: "US",
    },
    watchRegion: "US",
  };

  assert.deepEqual(
    parseRecommendationRequestBody(JSON.stringify(reviewedRequest)),
    {
      success: true,
      data: reviewedRequest,
    },
  );
});

test("rejects missing and blank request bodies", () => {
  for (const body of [undefined, "", " \n\t "]) {
    expectFailure(body, [{ code: "MISSING_BODY", path: [] }]);
  }
});

test("rejects malformed JSON without reflecting submitted text", () => {
  const privateMarker = "private-malformed-body-marker";
  const response = expectFailure('{"raw":"private-malformed-body-marker"', [
    { code: "MALFORMED_JSON", path: [] },
  ]);
  const serializedResponse = JSON.stringify(response);

  assert.equal(serializedResponse.includes(privateMarker), false);
  assert.equal(serializedResponse.includes('"raw"'), false);
});

test("maps non-object JSON values to INVALID_TYPE", () => {
  for (const body of ["null", "[]", "42", '"text"']) {
    expectFailure(body, [{ code: "INVALID_TYPE", path: [] }]);
  }
});

test("maps unsupported enum values without reflecting them", () => {
  const cases: Array<{
    body: string;
    hiddenValue: string;
    issues: RequestValidationIssue[];
  }> = [
    {
      body: '{"hardRestrictions":{"mediaType":"documentary"}}',
      hiddenValue: "documentary",
      issues: [
        {
          code: "UNSUPPORTED_VALUE",
          path: ["hardRestrictions", "mediaType"],
        },
      ],
    },
    {
      body: '{"softPreferences":{"mood":"private-mood-marker"}}',
      hiddenValue: "private-mood-marker",
      issues: [
        {
          code: "UNSUPPORTED_VALUE",
          path: ["softPreferences", "mood"],
        },
      ],
    },
  ];

  for (const testCase of cases) {
    const response = expectFailure(testCase.body, testCase.issues);
    assert.equal(
      JSON.stringify(response).includes(testCase.hiddenValue),
      false,
    );
  }
});

test("maps constrained values to INVALID_VALUE", () => {
  const cases: Array<{
    body: string;
    issues: RequestValidationIssue[];
  }> = [
    {
      body: '{"hardRestrictions":{"maximumRuntimeMinutes":0}}',
      issues: [
        {
          code: "INVALID_VALUE",
          path: ["hardRestrictions", "maximumRuntimeMinutes"],
        },
      ],
    },
    {
      body: '{"softPreferences":{"contentLanguage":"EN"}}',
      issues: [
        {
          code: "INVALID_VALUE",
          path: ["softPreferences", "contentLanguage"],
        },
      ],
    },
    {
      body: '{"softPreferences":{"preferredGenreIds":[18,18]}}',
      issues: [
        {
          code: "INVALID_VALUE",
          path: ["softPreferences", "preferredGenreIds"],
        },
      ],
    },
  ];

  for (const testCase of cases) {
    expectFailure(testCase.body, testCase.issues);
  }
});

test("requires watch region for provider restrictions", () => {
  expectFailure('{"hardRestrictions":{"requiredProviderIds":[8]}}', [
    { code: "INVALID_VALUE", path: ["watchRegion"] },
  ]);
});

test("rejects unknown fields without exposing their names or values", () => {
  const rootField = "privateRootFieldMarker";
  const rootValue = "privateRootValueMarker";
  const rootResponse = expectFailure(
    JSON.stringify({ [rootField]: rootValue }),
    [{ code: "UNKNOWN_FIELD", path: [] }],
  );
  const serializedRootResponse = JSON.stringify(rootResponse);

  assert.equal(serializedRootResponse.includes(rootField), false);
  assert.equal(serializedRootResponse.includes(rootValue), false);
  assert.equal(serializedRootResponse.includes("Unrecognized key"), false);

  const nestedValue = "privateFreshnessValueMarker";
  const nestedResponse = expectFailure(
    JSON.stringify({
      softPreferences: { freshness: nestedValue },
    }),
    [
      {
        code: "UNKNOWN_FIELD",
        path: ["softPreferences"],
      },
    ],
  );
  const serializedNestedResponse = JSON.stringify(nestedResponse);

  assert.equal(serializedNestedResponse.includes("freshness"), false);
  assert.equal(serializedNestedResponse.includes(nestedValue), false);
});

test("caps issue output and preserves only known paths and indices", () => {
  const privateMarker = "private-array-value-marker";
  const response = failureResponse(
    parseRecommendationRequestBody(
      JSON.stringify({
        softPreferences: {
          preferredGenreIds: Array.from({ length: 30 }, () => privateMarker),
        },
      }),
    ),
  );

  assert.equal(response.error.issues.length, 20);

  for (const [index, issue] of response.error.issues.entries()) {
    assert.deepEqual(issue, {
      code: "INVALID_TYPE",
      path: ["softPreferences", "preferredGenreIds", index],
    });
  }

  const serializedResponse = JSON.stringify(response);
  assert.equal(serializedResponse.includes(privateMarker), false);
  assert.equal(serializedResponse.includes("Invalid input"), false);
});
