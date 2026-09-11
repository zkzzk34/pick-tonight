import type {
  RecommendationCardData,
  RecommendationCardSet,
} from "./recommendation-card-model";

function previewCard(
  overrides: Partial<RecommendationCardData>,
): RecommendationCardData {
  return {
    mediaKey: "preview:movie-a",
    title: "Preview movie A",
    year: 2025,
    mediaType: "movie",
    overview: "Sample overview showing the recommendation-card layout.",
    posterUrl: null,
    genres: ["Comedy", "Adventure"],
    runtime: { kind: "movie", minutes: 101 },
    rating: { average: 7.6, voteCount: 840, confidence: "high" },
    freshness: null,
    providerAvailability: null,
    trailerUrl: null,
    fitExplanation: null,
    ...overrides,
  };
}

export const INITIAL_PREVIEW_RECOMMENDATIONS = [
  previewCard({}),
  previewCard({
    mediaKey: "preview:tv-b",
    title: "Preview television B",
    year: 2024,
    mediaType: "tv",
    genres: ["Drama"],
    runtime: { kind: "episode", minutes: 47 },
    rating: { average: 7.2, voteCount: 18, confidence: "low" },
  }),
  previewCard({
    mediaKey: "preview:movie-c",
    title: "Preview movie C",
    year: null,
    genres: [],
    runtime: null,
    rating: { average: 0, voteCount: 0, confidence: "none" },
  }),
] as const satisfies RecommendationCardSet;

export const PREVIEW_REPLACEMENT = previewCard({
  mediaKey: "preview:movie-d",
  title: "Preview movie D",
  year: 2023,
  genres: ["Mystery"],
  runtime: { kind: "movie", minutes: 96 },
  rating: { average: 7.4, voteCount: 132, confidence: "established" },
});
