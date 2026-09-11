import type { RecommendationRequest } from "../shared/recommendation-contracts";
import type { RecommendationCardSet } from "./recommendation-card-model";

export const RECOMMENDATION_FAILURE_KINDS = [
  "validation",
  "authentication",
  "timeout",
  "upstream",
] as const;

export type RecommendationFailureKind =
  (typeof RECOMMENDATION_FAILURE_KINDS)[number];

export interface RecommendationFailureCopy {
  readonly title: string;
  readonly message: string;
}

const RECOMMENDATION_FAILURE_COPY = {
  validation: {
    title: "Check your preferences",
    message:
      "Some submitted preferences could not be used. Review them and try again.",
  },
  authentication: {
    title: "Recommendations are temporarily unavailable",
    message:
      "PickTonight cannot securely access recommendation data right now. Try again later.",
  },
  timeout: {
    title: "The request took too long",
    message:
      "PickTonight could not finish in time. Try the same preferences again.",
  },
  upstream: {
    title: "Recommendations are temporarily unavailable",
    message: "PickTonight could not finish this request. Try again shortly.",
  },
} as const satisfies Record<
  RecommendationFailureKind,
  RecommendationFailureCopy
>;

export type RecommendationRequestResult =
  | {
      readonly status: "complete";
      readonly recommendations: RecommendationCardSet;
    }
  | {
      readonly status: "empty";
    }
  | {
      readonly status: "error";
      readonly failure: RecommendationFailureKind;
    };

export type RecommendationRequestViewState =
  | {
      readonly status: "idle";
    }
  | {
      readonly status: "loading";
    }
  | RecommendationRequestResult;

export type RecommendationRequester = (
  submittedPreferences: RecommendationRequest,
) => Promise<RecommendationRequestResult>;

export function snapshotRecommendationRequest(
  request: RecommendationRequest,
): RecommendationRequest {
  return structuredClone(request);
}

export function recommendationFailureCopy(
  failure: RecommendationFailureKind,
): RecommendationFailureCopy {
  return RECOMMENDATION_FAILURE_COPY[failure];
}
