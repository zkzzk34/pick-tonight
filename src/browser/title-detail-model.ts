import type {
  RecommendationCardAction,
  RecommendationRatingConfidence,
  RecommendationRuntime,
} from "./recommendation-card-model";

export type TitleDetailAction = Exclude<RecommendationCardAction, "details">;

export type TitleDetailReasonKind = "verified" | "soft-match" | "neutral";

export interface TitleDetailReason {
  readonly kind: TitleDetailReasonKind;
  readonly label: string;
  readonly text: string;
}

export interface TitleDetailExplanation {
  readonly summary: string;
  readonly reasons: readonly TitleDetailReason[];
}

export interface TitleDetailProviderAvailability {
  readonly source: "justwatch";
  readonly watchRegion: string;
  readonly tmdbUrl: string | null;
  readonly streaming: readonly string[];
  readonly free: readonly string[];
  readonly ads: readonly string[];
  readonly rent: readonly string[];
  readonly buy: readonly string[];
}

export interface TitleDetailData {
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
  readonly watchRegion: string;
  readonly providerAvailability: TitleDetailProviderAvailability | null;
  readonly trailerUrl: string | null;
  readonly fitExplanation: TitleDetailExplanation | null;
}

export function hasProviderAvailability(
  availability: TitleDetailProviderAvailability,
): boolean {
  return [
    availability.streaming,
    availability.free,
    availability.ads,
    availability.rent,
    availability.buy,
  ].some((providers) => providers.length > 0);
}
