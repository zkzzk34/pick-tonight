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
    rating: {
      average: 7.6,
      voteCount: 840,
      confidence: "high",
    },
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
    rating: {
      average: 7.2,
      voteCount: 18,
      confidence: "low",
    },
  }),
  previewCard({
    mediaKey: "preview:movie-c",
    title: "Preview movie C",
    year: null,
    genres: [],
    runtime: null,
    rating: {
      average: 0,
      voteCount: 0,
      confidence: "none",
    },
  }),
] as const satisfies RecommendationCardSet;

const PREVIEW_MOVIE_D = previewCard({
  mediaKey: "preview:movie-d",
  title: "Preview movie D",
  year: 2023,
  genres: ["Mystery"],
  runtime: { kind: "movie", minutes: 96 },
  rating: {
    average: 7.4,
    voteCount: 132,
    confidence: "established",
  },
});

const PREVIEW_TELEVISION_E = previewCard({
  mediaKey: "preview:tv-e",
  title: "Preview television E",
  year: 2022,
  mediaType: "tv",
  overview:
    "Additional deterministic replacement candidate for feedback-flow testing.",
  genres: ["Science Fiction", "Drama"],
  runtime: { kind: "episode", minutes: 52 },
  rating: {
    average: 7.8,
    voteCount: 410,
    confidence: "high",
  },
});

const PREVIEW_MOVIE_F = previewCard({
  mediaKey: "preview:movie-f",
  title: "Preview movie F",
  year: 1998,
  overview:
    "Additional deterministic movie replacement candidate for the active session.",
  genres: ["Comedy", "Drama"],
  runtime: { kind: "movie", minutes: 108 },
  rating: {
    average: 7.1,
    voteCount: 265,
    confidence: "established",
  },
});

export const PREVIEW_REPLACEMENT_POOL = [
  PREVIEW_MOVIE_D,
  PREVIEW_TELEVISION_E,
  PREVIEW_MOVIE_F,
] as const satisfies readonly RecommendationCardData[];

/**
 * Kept as the first deterministic replacement for existing preview
 * compatibility and regression tests.
 */
export const PREVIEW_REPLACEMENT = PREVIEW_REPLACEMENT_POOL[0];
