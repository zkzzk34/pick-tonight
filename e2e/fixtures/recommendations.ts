export const RECOMMENDATION_SUCCESS_FIXTURE = {
  status: "complete",
  recommendations: [
    {
      mediaKey: "preview:movie-a",
      title: "Preview movie A",
      year: 2025,
      mediaType: "movie",
      decisionEvidence: {
        candidateAgeCode: "established",
        ratingConfidenceCode: "strong",
      },
      overview: "Sample overview showing the recommendation-card layout.",
      posterUrl: null,
      genres: ["Comedy", "Adventure"],
      runtime: {
        kind: "movie",
        minutes: 101,
      },
      rating: {
        average: 7.6,
        voteCount: 840,
        confidence: "high",
      },
      freshness: null,
      providerAvailability: null,
      trailerUrl: null,
      fitExplanation: null,
    },
    {
      mediaKey: "preview:tv-b",
      title: "Preview television B",
      year: 2024,
      mediaType: "tv",
      decisionEvidence: {
        candidateAgeCode: "established",
        ratingConfidenceCode: "limited",
      },
      overview: "Sample overview showing the recommendation-card layout.",
      posterUrl: null,
      genres: ["Drama"],
      runtime: {
        kind: "episode",
        minutes: 47,
      },
      rating: {
        average: 7.2,
        voteCount: 18,
        confidence: "low",
      },
      freshness: null,
      providerAvailability: null,
      trailerUrl: null,
      fitExplanation: null,
    },
    {
      mediaKey: "preview:movie-c",
      title: "Preview movie C",
      year: null,
      mediaType: "movie",
      decisionEvidence: {
        candidateAgeCode: "unknown",
        ratingConfidenceCode: "limited",
      },
      overview: "Sample overview showing the recommendation-card layout.",
      posterUrl: null,
      genres: [],
      runtime: null,
      rating: {
        average: 0,
        voteCount: 0,
        confidence: "none",
      },
      freshness: null,
      providerAvailability: null,
      trailerUrl: null,
      fitExplanation: null,
    },
  ],
} as const;

export const LONG_CONTENT_TITLE =
  "An Extraordinarily Long International Recommendation Title for an Evening When Everyone Wants Something Different";

export const LONG_CONTENT_RECOMMENDATION_FIXTURE = {
  ...RECOMMENDATION_SUCCESS_FIXTURE,
  recommendations: [
    {
      ...RECOMMENDATION_SUCCESS_FIXTURE.recommendations[0],
      mediaKey: "compatibility:long-movie-a",
      title: LONG_CONTENT_TITLE,
      overview:
        "A deliberately long translated-content-ready overview verifies that recommendation copy can wrap naturally across narrow and wide layouts without relying on short English text.",
      genres: [
        "International comedy and adventure",
        "Character-driven ensemble storytelling",
      ],
    },
    RECOMMENDATION_SUCCESS_FIXTURE.recommendations[1],
    RECOMMENDATION_SUCCESS_FIXTURE.recommendations[2],
  ],
} as const;
