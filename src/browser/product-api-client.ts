import {
  RECOMMENDATIONS_API_PATH,
  TITLE_DETAILS_API_PREFIX,
} from "../shared/api-paths";
import type { RecommendationRequest } from "../shared/recommendation-contracts";
import {
  productRecommendationResponseSchema,
  productTitleDetailResponseSchema,
  type ProductRecommendation,
} from "../shared/product-api-contracts";
import type {
  RecommendationCardData,
  RecommendationRatingConfidence,
} from "./recommendation-card-model";
import type { RecommendationFailureKind } from "./recommendation-request-state";
import type { TitleDetailData } from "./title-detail-model";

export interface ProductSessionExclusions {
  readonly shownMediaKeys: readonly string[];
  readonly removedMediaKeys: readonly string[];
}

export type ProductRecommendationBatchResult =
  | {
      readonly status: "complete";
      readonly recommendations: readonly RecommendationCardData[];
    }
  | {
      readonly status: "empty";
    }
  | {
      readonly status: "error";
      readonly failure: RecommendationFailureKind;
    };

export type ProductTitleDetailResult =
  | {
      readonly status: "complete";
      readonly detail: TitleDetailData;
    }
  | {
      readonly status: "error";
      readonly failure: RecommendationFailureKind;
    };

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

function explanationReasonLabel(code: string): string {
  switch (code) {
    case "runtime-within-limit":
      return "Runtime verified";
    case "provider-availability":
      return "Provider availability";
    case "preferred-genre-match":
      return "Genre match";
    case "mood-match":
      return "Mood match";
    case "freshness-match":
      return "Freshness match";
    case "rating-confidence":
      return "Rating confidence";
    case "content-language-match":
      return "Language match";
    default:
      return "Recommendation fit";
  }
}

function mapProductRecommendation(
  recommendation: ProductRecommendation,
): RecommendationCardData {
  return {
    mediaKey: recommendation.mediaKey,
    title: recommendation.title,
    year: recommendation.year,
    mediaType: recommendation.mediaType,
    decisionEvidence: recommendation.decisionEvidence,
    overview: recommendation.overview,
    posterUrl: recommendation.posterUrl,
    genres: recommendation.genres,
    runtime: recommendation.runtime,
    rating: recommendation.rating,
    freshness: recommendation.freshness,
    providerAvailability: recommendation.providerAvailability,
    trailerUrl: recommendation.trailerUrl,
    fitExplanation: {
      source: "structured-recommendation-evidence",
      text: recommendation.explanation.summary,
      reasons: recommendation.explanation.reasons.map((reason) => ({
        kind: reason.kind === "verified-constraint" ? "verified" : "soft-match",
        label: explanationReasonLabel(reason.code),
        text: reason.text,
      })),
    },
  };
}

function mediaId(
  recommendation: Pick<RecommendationCardData, "mediaKey" | "mediaType">,
): number | null {
  const match = /^(movie|tv):([1-9]\d*)$/.exec(recommendation.mediaKey);

  if (match === null || match[1] !== recommendation.mediaType) {
    return null;
  }

  const id = Number(match[2]);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fitExplanationForDetail(
  recommendation: RecommendationCardData,
): TitleDetailData["fitExplanation"] {
  if (recommendation.fitExplanation === null) {
    return null;
  }

  return {
    summary: recommendation.fitExplanation.text,
    reasons: recommendation.fitExplanation.reasons ?? [],
  };
}

export async function requestProductRecommendationBatch(
  submittedPreferences: RecommendationRequest,
  requestedCount: 1 | 3,
  exclusions?: ProductSessionExclusions,
): Promise<ProductRecommendationBatchResult> {
  try {
    const response = await fetch(RECOMMENDATIONS_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request: submittedPreferences,
        requestedCount,
        ...(exclusions === undefined ? {} : { exclusions }),
      }),
    });

    if (!response.ok) {
      return {
        status: "error",
        failure: failureForHttpStatus(response.status),
      };
    }

    const parsed = productRecommendationResponseSchema.safeParse(
      await response.json(),
    );

    if (!parsed.success) {
      return {
        status: "error",
        failure: "upstream",
      };
    }

    const recommendations = parsed.data.data.recommendations;

    if (recommendations.length === 0) {
      return { status: "empty" };
    }

    if (recommendations.length !== requestedCount) {
      return {
        status: "error",
        failure: "upstream",
      };
    }

    return {
      status: "complete",
      recommendations: recommendations.map(mapProductRecommendation),
    };
  } catch {
    return {
      status: "error",
      failure: "upstream",
    };
  }
}

export async function requestProductTitleDetail(
  recommendation: RecommendationCardData,
  watchRegion: string,
): Promise<ProductTitleDetailResult> {
  const id = mediaId(recommendation);

  if (id === null || !/^[A-Z]{2}$/.test(watchRegion)) {
    return {
      status: "error",
      failure: "validation",
    };
  }

  const search = new URLSearchParams({
    watchRegion,
  });

  try {
    const response = await fetch(
      `${TITLE_DETAILS_API_PREFIX}/${recommendation.mediaType}/${id}?${search.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return {
        status: "error",
        failure: failureForHttpStatus(response.status),
      };
    }

    const parsed = productTitleDetailResponseSchema.safeParse(
      await response.json(),
    );

    if (
      !parsed.success ||
      parsed.data.data.mediaKey !== recommendation.mediaKey ||
      parsed.data.data.mediaType !== recommendation.mediaType
    ) {
      return {
        status: "error",
        failure: "upstream",
      };
    }

    return {
      status: "complete",
      detail: {
        ...parsed.data.data,
        fitExplanation: fitExplanationForDetail(recommendation),
      },
    };
  } catch {
    return {
      status: "error",
      failure: "upstream",
    };
  }
}

export function recommendationFailureMessage(
  failure: RecommendationFailureKind,
): string {
  switch (failure) {
    case "validation":
      return "The current recommendation request could not be used.";
    case "authentication":
      return "Recommendation data cannot be accessed securely right now.";
    case "timeout":
      return "Recommendation data took too long to respond.";
    case "upstream":
      return "Recommendation data is temporarily unavailable.";
  }
}

export function isDisplayRatingConfidence(
  value: string,
): value is RecommendationRatingConfidence {
  return ["none", "low", "medium", "established", "high"].includes(
    value as RecommendationRatingConfidence,
  );
}
