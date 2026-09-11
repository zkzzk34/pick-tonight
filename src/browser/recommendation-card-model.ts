export const RECOMMENDATION_CARD_COUNT = 3;

export type RecommendationRatingConfidence =
  "none" | "low" | "medium" | "established" | "high";

export type RecommendationCardAction =
  | "choose-tonight"
  | "details"
  | "save"
  | "more-like-this"
  | "not-tonight"
  | "not-my-taste"
  | "already-watched";

export type RecommendationRuntime =
  | { readonly kind: "movie"; readonly minutes: number }
  | { readonly kind: "episode"; readonly minutes: number };

export interface RecommendationCardData {
  readonly mediaKey: string;
  readonly title: string;
  readonly year: number | null;
  readonly mediaType: "movie" | "tv";
  readonly overview: string | null;
  readonly posterUrl: string | null;
  readonly genres: readonly string[];
  readonly runtime: RecommendationRuntime | null;
  readonly rating: {
    readonly average: number;
    readonly voteCount: number | null;
    readonly confidence: RecommendationRatingConfidence;
  } | null;
  readonly freshness: {
    readonly label: string;
    readonly basis:
      "release-date" | "first-air-date" | "now-playing" | "on-the-air";
  } | null;
  readonly providerAvailability: {
    readonly source: "justwatch";
    readonly watchRegion: string;
    readonly providerNames: readonly string[];
  } | null;
  readonly trailerUrl: string | null;
  readonly fitExplanation: {
    readonly source: "structured-recommendation-evidence";
    readonly text: string;
  } | null;
}

export type RecommendationCardSet = readonly [
  RecommendationCardData,
  RecommendationCardData,
  RecommendationCardData,
];

export const ratingConfidenceLabels: Readonly<
  Record<RecommendationRatingConfidence, string>
> = {
  none: "No meaningful rating sample yet",
  low: "Limited rating evidence",
  medium: "Moderate rating evidence",
  established: "Established rating evidence",
  high: "High-volume rating evidence",
};

export function isRecommendationCardSet(
  recommendations: readonly RecommendationCardData[],
): recommendations is RecommendationCardSet {
  return recommendations.length === RECOMMENDATION_CARD_COUNT;
}

export function replaceRecommendationAt(
  recommendations: RecommendationCardSet,
  index: number,
  replacement: RecommendationCardData,
): RecommendationCardSet {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= RECOMMENDATION_CARD_COUNT
  ) {
    return recommendations;
  }

  return [
    index === 0 ? replacement : recommendations[0],
    index === 1 ? replacement : recommendations[1],
    index === 2 ? replacement : recommendations[2],
  ];
}

export function safeHttpsUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatRuntime(
  runtime: RecommendationRuntime | null,
): string | null {
  if (
    runtime === null ||
    !Number.isInteger(runtime.minutes) ||
    runtime.minutes <= 0
  ) {
    return null;
  }

  const hours = Math.floor(runtime.minutes / 60);
  const minutes = runtime.minutes % 60;
  const duration = [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return runtime.kind === "episode" ? `${duration} per episode` : duration;
}
