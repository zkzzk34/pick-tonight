import {
  RECOMMENDATION_EXPLANATION_MAX_REASONS,
  recommendationExplanationSchema,
  type RecommendationExplanation,
  type RecommendationReason,
  type RecommendationRequest,
} from "../shared/recommendation-contracts.ts";

import type { RecommendationScoreBreakdown } from "./recommendation-engine.ts";
import type { TmdbHardRestrictionEvidence } from "./tmdb-discovery-candidates.ts";

const SUMMARY_WITH_REASONS = "This title stands out for the reasons below.";
const SUMMARY_WITHOUT_REASONS =
  "This title is recommended from the information currently available.";

export interface GenerateRecommendationExplanationInput {
  readonly request: RecommendationRequest;
  readonly score: RecommendationScoreBreakdown;
  readonly hardRestrictionEvidence: TmdbHardRestrictionEvidence;
}

function sameIdSet(
  first: readonly number[],
  second: readonly number[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const firstSorted = [...first].sort((left, right) => left - right);
  const secondSorted = [...second].sort((left, right) => left - right);

  return firstSorted.every((id, index) => id === secondSorted[index]);
}

function providerAvailabilityReason({
  request,
  hardRestrictionEvidence,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const requestedProviderIds = request.hardRestrictions?.requiredProviderIds;
  const requestedRegion = request.watchRegion;
  const providerEvidence = hardRestrictionEvidence.providerRestriction;

  if (
    requestedProviderIds === undefined ||
    requestedProviderIds.length === 0 ||
    requestedRegion === undefined ||
    providerEvidence === null ||
    providerEvidence.watchRegion !== requestedRegion ||
    !sameIdSet(providerEvidence.requiredProviderIds, requestedProviderIds)
  ) {
    return null;
  }

  return {
    kind: "verified-constraint",
    code: "provider-availability",
    text: "Available through your selected streaming options in your chosen region.",
  };
}

function runtimeWithinLimitReason({
  request,
  hardRestrictionEvidence,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const requestedLimit = request.hardRestrictions?.maximumRuntimeMinutes;

  if (
    requestedLimit === undefined ||
    hardRestrictionEvidence.maximumRuntimeMinutes !== requestedLimit
  ) {
    return null;
  }

  return {
    kind: "verified-constraint",
    code: "runtime-within-limit",
    text: "Fits within your " + requestedLimit + "-minute runtime limit.",
  };
}

function preferredGenreReason({
  request,
  score,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const requestedGenreIds = request.softPreferences?.preferredGenreIds;

  if (
    requestedGenreIds === undefined ||
    requestedGenreIds.length === 0 ||
    !sameIdSet(score.preferredGenres.requestedGenreIds, requestedGenreIds)
  ) {
    return null;
  }

  const supportedMatches = score.preferredGenres.matchedGenreIds.filter(
    (genreId) => requestedGenreIds.includes(genreId),
  );

  if (supportedMatches.length === 0 || score.preferredGenres.points <= 0) {
    return null;
  }

  return {
    kind: "soft-match",
    code: "preferred-genre-match",
    text:
      supportedMatches.length === 1
        ? "Matches one of your preferred genres."
        : "Matches multiple preferred genres.",
  };
}

function moodReason({
  request,
  score,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const requestedMood = request.softPreferences?.mood;

  if (
    requestedMood === undefined ||
    score.mood.requestedMood !== requestedMood ||
    score.mood.matchedGenreIds.length === 0 ||
    score.mood.points <= 0
  ) {
    return null;
  }

  return {
    kind: "soft-match",
    code: "mood-match",
    text: "Fits the " + requestedMood + " mood you chose.",
  };
}

function freshnessReason({
  request,
  score,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const freshness = request.softPreferences?.freshness;
  const releaseYear = score.releaseContext.releaseYear;

  if (
    freshness === undefined ||
    releaseYear === null ||
    releaseYear < freshness.releasedSinceYear
  ) {
    return null;
  }

  return {
    kind: "soft-match",
    code: "freshness-match",
    text:
      "Released in " +
      releaseYear +
      ", matching your requested release window.",
  };
}

function contentLanguageReason({
  request,
  score,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const requestedLanguage = request.softPreferences?.contentLanguage;

  if (
    requestedLanguage === undefined ||
    score.contentLanguage.requestedLanguage !== requestedLanguage ||
    !score.contentLanguage.matched ||
    score.contentLanguage.points <= 0
  ) {
    return null;
  }

  return {
    kind: "soft-match",
    code: "content-language-match",
    text: "Matches your preferred content language.",
  };
}

function ratingConfidenceReason({
  score,
}: GenerateRecommendationExplanationInput): RecommendationReason | null {
  const rating = score.rating;

  if (
    rating.voteAverage === null ||
    rating.voteCount === null ||
    !rating.meaningfulEvidence ||
    rating.voteCount < 100 ||
    rating.points <= 0
  ) {
    return null;
  }

  if (rating.confidenceState === "medium") {
    return {
      kind: "soft-match",
      code: "rating-confidence",
      text: "Its viewer rating is supported by substantial feedback.",
    };
  }

  if (rating.confidenceState === "strong") {
    return {
      kind: "soft-match",
      code: "rating-confidence",
      text: "Its viewer rating is supported by extensive feedback.",
    };
  }

  return null;
}

function isReason(
  reason: RecommendationReason | null,
): reason is RecommendationReason {
  return reason !== null;
}

function selectReasons(
  verifiedReasons: readonly RecommendationReason[],
  softReasons: readonly RecommendationReason[],
): RecommendationReason[] {
  const firstVerified = verifiedReasons[0];
  const firstSoft = softReasons[0];

  if (firstVerified !== undefined && firstSoft !== undefined) {
    return [firstVerified, firstSoft];
  }

  return [...verifiedReasons, ...softReasons].slice(
    0,
    RECOMMENDATION_EXPLANATION_MAX_REASONS,
  );
}

export function generateRecommendationExplanation(
  input: GenerateRecommendationExplanationInput,
): RecommendationExplanation {
  const verifiedReasons = [
    providerAvailabilityReason(input),
    runtimeWithinLimitReason(input),
  ].filter(isReason);

  const softReasons = [
    preferredGenreReason(input),
    moodReason(input),
    freshnessReason(input),
    contentLanguageReason(input),
    ratingConfidenceReason(input),
  ].filter(isReason);

  const reasons = selectReasons(verifiedReasons, softReasons);

  return recommendationExplanationSchema.parse({
    summary:
      reasons.length > 0 ? SUMMARY_WITH_REASONS : SUMMARY_WITHOUT_REASONS,
    reasons,
  });
}
