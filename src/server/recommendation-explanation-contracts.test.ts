import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOMMENDATION_EXPLANATION_MAX_REASONS,
  RECOMMENDATION_EXPLANATION_SUMMARY_MAX_LENGTH,
  RECOMMENDATION_REASON_CODES,
  RECOMMENDATION_REASON_TEXT_MAX_LENGTH,
  recommendationExplanationSchema,
} from "../shared/recommendation-contracts.ts";

function assertExplanationRejected(value: unknown): void {
  assert.equal(recommendationExplanationSchema.safeParse(value).success, false);
}

test("explanation contracts define reason codes in deterministic order", () => {
  assert.deepEqual(RECOMMENDATION_REASON_CODES, [
    "runtime-within-limit",
    "provider-availability",
    "preferred-genre-match",
    "mood-match",
    "freshness-match",
    "rating-confidence",
    "content-language-match",
  ]);
  assert.equal(RECOMMENDATION_EXPLANATION_MAX_REASONS, 2);
});

test("explanation contracts accept verified and soft-match reasons", () => {
  const explanation = {
    summary: "It fits your runtime limit and matches a preferred genre.",
    reasons: [
      {
        kind: "verified-constraint",
        code: "runtime-within-limit",
        text: "Fits your runtime limit.",
      },
      {
        kind: "soft-match",
        code: "preferred-genre-match",
        text: "Matches a preferred genre.",
      },
    ],
  };

  assert.deepEqual(
    recommendationExplanationSchema.parse(explanation),
    explanation,
  );
});

test("explanation contracts accept a neutral missing-data fallback", () => {
  const explanation = {
    summary: "Here is one option to consider tonight.",
    reasons: [],
  };

  assert.deepEqual(
    recommendationExplanationSchema.parse(explanation),
    explanation,
  );
});

test("explanation contracts reject more than two reasons", () => {
  const reason = {
    kind: "soft-match",
    code: "mood-match",
    text: "Matches your requested mood.",
  };

  assertExplanationRejected({
    summary: "This matches several of your stated preferences.",
    reasons: [reason, reason, reason],
  });
});

test("explanation contracts reject a code with the wrong kind", () => {
  assertExplanationRejected({
    summary: "This fits your runtime limit.",
    reasons: [
      {
        kind: "soft-match",
        code: "runtime-within-limit",
        text: "Fits your runtime limit.",
      },
    ],
  });
});

test("explanation contracts reject unknown fields", () => {
  assertExplanationRejected({
    summary: "Here is one option to consider tonight.",
    reasons: [],
    unsupportedClaim: true,
  });

  assertExplanationRejected({
    summary: "This matches your requested mood.",
    reasons: [
      {
        kind: "soft-match",
        code: "mood-match",
        text: "Matches your requested mood.",
        internalWeight: 18,
      },
    ],
  });
});

test("explanation contracts reject blank or overlong copy", () => {
  assertExplanationRejected({
    summary: "   ",
    reasons: [],
  });

  assertExplanationRejected({
    summary: "x".repeat(RECOMMENDATION_EXPLANATION_SUMMARY_MAX_LENGTH + 1),
    reasons: [],
  });

  assertExplanationRejected({
    summary: "This matches your requested mood.",
    reasons: [
      {
        kind: "soft-match",
        code: "mood-match",
        text: "x".repeat(RECOMMENDATION_REASON_TEXT_MAX_LENGTH + 1),
      },
    ],
  });
});
