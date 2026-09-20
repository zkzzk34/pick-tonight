export const RECOMMENDATION_CANDIDATE_AGE_CODES = [
  "recent",
  "established",
  "unknown",
] as const;

export type RecommendationCandidateAgeCode =
  (typeof RECOMMENDATION_CANDIDATE_AGE_CODES)[number];

export const RECOMMENDATION_RATING_CONFIDENCE_CODES = [
  "limited",
  "medium",
  "strong",
] as const;

export type RecommendationRatingConfidenceCode =
  (typeof RECOMMENDATION_RATING_CONFIDENCE_CODES)[number];

export interface RecommendationDecisionEvidence {
  readonly candidateAgeCode: RecommendationCandidateAgeCode;
  readonly ratingConfidenceCode: RecommendationRatingConfidenceCode;
}
