import type { RecommendationRequest } from "../shared/recommendation-contracts";
import { usesDeterministicBrowserFixtures } from "./browser-data-mode";
import { INITIAL_PREVIEW_RECOMMENDATIONS } from "./recommendation-card-preview";
import { requestProductRecommendationBatch } from "./product-api-client";
import {
  isRecommendationCardSet,
  type RecommendationCardData,
} from "./recommendation-card-model";
import type {
  RecommendationFailureKind,
  RecommendationRequester,
  RecommendationRequestResult,
} from "./recommendation-request-state";

export const E2E_RECOMMENDATION_API_PATH = "/api/e2e/recommendations";

const FAILURE_KINDS = new Set<RecommendationFailureKind>([
  "validation",
  "authentication",
  "timeout",
  "upstream",
]);

function requestPreviewRecommendations(): Promise<RecommendationRequestResult> {
  return Promise.resolve({
    status: "complete",
    recommendations: INITIAL_PREVIEW_RECOMMENDATIONS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecommendationCardData(
  value: unknown,
): value is RecommendationCardData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.mediaKey === "string" &&
    typeof value.title === "string" &&
    (value.year === null || typeof value.year === "number") &&
    (value.mediaType === "movie" || value.mediaType === "tv") &&
    Array.isArray(value.genres) &&
    value.genres.every((genre) => typeof genre === "string")
  );
}

function parseRecommendationResult(
  value: unknown,
): RecommendationRequestResult | null {
  if (!isRecord(value) || typeof value.status !== "string") {
    return null;
  }

  if (value.status === "empty") {
    return { status: "empty" };
  }

  if (
    value.status === "error" &&
    typeof value.failure === "string" &&
    FAILURE_KINDS.has(value.failure as RecommendationFailureKind)
  ) {
    return {
      status: "error",
      failure: value.failure as RecommendationFailureKind,
    };
  }

  if (
    value.status === "complete" &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every(isRecommendationCardData) &&
    isRecommendationCardSet(value.recommendations)
  ) {
    return {
      status: "complete",
      recommendations: value.recommendations,
    };
  }

  return null;
}

function failureForHttpStatus(status: number): RecommendationFailureKind {
  if (status === 400 || status === 422) {
    return "validation";
  }

  if (status === 401 || status === 403) {
    return "authentication";
  }

  if (status === 408 || status === 504) {
    return "timeout";
  }

  return "upstream";
}

async function requestLiveRecommendations(
  submittedPreferences: RecommendationRequest,
): Promise<RecommendationRequestResult> {
  const result = await requestProductRecommendationBatch(
    submittedPreferences,
    3,
  );

  if (result.status !== "complete") {
    return result;
  }

  if (!isRecommendationCardSet(result.recommendations)) {
    return {
      status: "error",
      failure: "upstream",
    };
  }

  return {
    status: "complete",
    recommendations: result.recommendations,
  };
}

async function requestE2eRecommendations(
  submittedPreferences: RecommendationRequest,
): Promise<RecommendationRequestResult> {
  try {
    const response = await fetch(E2E_RECOMMENDATION_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submittedPreferences),
    });

    if (!response.ok) {
      return {
        status: "error",
        failure: failureForHttpStatus(response.status),
      };
    }

    const parsed = parseRecommendationResult(await response.json());

    return (
      parsed ?? {
        status: "error",
        failure: "upstream",
      }
    );
  } catch {
    return {
      status: "error",
      failure: "upstream",
    };
  }
}

/**
 * Normal development, Preview, and pilot execution use the real same-origin
 * product API.
 *
 * Vitest keeps the deterministic local preview, while the explicit Playwright
 * E2E mode keeps its checked-in HTTP fixture seam.
 */
export const requestConfiguredRecommendations: RecommendationRequester = (
  submittedPreferences,
) => {
  if (import.meta.env.VITE_PICKTONIGHT_E2E_API === "1") {
    return requestE2eRecommendations(submittedPreferences);
  }

  if (usesDeterministicBrowserFixtures()) {
    return requestPreviewRecommendations();
  }

  return requestLiveRecommendations(submittedPreferences);
};
