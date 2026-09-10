import type { MediaSummary } from "../shared/media-contracts.ts";
import type {
  RecommendationRequest,
  SupportedMood,
} from "../shared/recommendation-contracts.ts";
import { getMoodMapping, MOOD_MAPPING_VERSION } from "./mood-mapping.ts";
import type { TmdbDiscoveryCandidate } from "./tmdb-discovery-candidates.ts";

export const RECOMMENDATION_HEURISTIC_VERSION = MOOD_MAPPING_VERSION;
export const RECOMMENDATION_LIMIT = 3;
export const TEMPORAL_COHESION_SCORE_WINDOW = 5;
export const TEMPORAL_COHESION_MAX_YEAR_GAP = 50;

export const RECOMMENDATION_WEIGHTS = {
  preferredGenrePerMatch: 30,
  preferredGenreMaximum: 60,
  moodFirstMatch: 18,
  moodAdditionalMatch: 4,
  moodMaximum: 26,
  contentLanguageMatch: 12,
  ratingMaximum: 20,
} as const;

export type RatingConfidenceTier =
  "none" | "low" | "medium" | "established" | "high";

export interface PreferredGenreScoreEvidence {
  readonly requestedGenreIds: readonly number[];
  readonly matchedGenreIds: readonly number[];
  readonly points: number;
}

export interface MoodScoreEvidence {
  readonly requestedMood: SupportedMood | null;
  readonly matchedGenreIds: readonly number[];
  readonly discoverySignals: readonly "cross-genre-variety"[];
  readonly points: number;
}

export interface ContentLanguageScoreEvidence {
  readonly requestedLanguage: string | null;
  readonly actualLanguage: string | null;
  readonly matched: boolean;
  readonly points: number;
}

export interface RatingScoreEvidence {
  readonly voteAverage: number | null;
  readonly voteCount: number | null;
  readonly confidenceTier: RatingConfidenceTier;
  readonly confidenceFactor: number;
  readonly points: number;
}

export interface ReleaseContextEvidence {
  readonly releaseYear: number | null;
  readonly points: 0;
}

export interface RecommendationScoreBreakdown {
  readonly version: typeof RECOMMENDATION_HEURISTIC_VERSION;
  readonly preferredGenres: PreferredGenreScoreEvidence;
  readonly mood: MoodScoreEvidence;
  readonly contentLanguage: ContentLanguageScoreEvidence;
  readonly rating: RatingScoreEvidence;
  readonly releaseContext: ReleaseContextEvidence;
  readonly total: number;
}

export interface RecommendationMediaIdentity {
  readonly mediaType: MediaSummary["mediaType"];
  readonly id: number;
}

export function recommendationMediaKey(
  identity: RecommendationMediaIdentity,
): string {
  return `${identity.mediaType}:${identity.id}`;
}

function sameIdSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((first, second) => first - second);
  const sortedRight = [...right].sort((first, second) => first - second);

  return sortedLeft.every(
    (identifier, index) => identifier === sortedRight[index],
  );
}

export function candidateSatisfiesHardRestrictions(
  candidate: TmdbDiscoveryCandidate,
  request: RecommendationRequest,
): boolean {
  const { media, hardRestrictionEvidence } = candidate;
  const hardRestrictions = request.hardRestrictions;
  const requestedMediaType = hardRestrictions?.mediaType;

  if (
    requestedMediaType !== undefined &&
    requestedMediaType !== "either" &&
    media.mediaType !== requestedMediaType
  ) {
    return false;
  }

  if (media.adult === true) {
    return false;
  }

  const excludedGenreIds = new Set(hardRestrictions?.excludedGenreIds ?? []);

  if (media.genreIds.some((genreId) => excludedGenreIds.has(genreId))) {
    return false;
  }

  const maximumRuntimeMinutes = hardRestrictions?.maximumRuntimeMinutes;

  if (
    maximumRuntimeMinutes !== undefined &&
    hardRestrictionEvidence.maximumRuntimeMinutes !== maximumRuntimeMinutes
  ) {
    return false;
  }

  const requiredProviderIds = hardRestrictions?.requiredProviderIds;

  if (requiredProviderIds !== undefined) {
    const providerEvidence = hardRestrictionEvidence.providerRestriction;

    if (
      request.watchRegion === undefined ||
      providerEvidence === null ||
      providerEvidence.watchRegion !== request.watchRegion ||
      !sameIdSet(providerEvidence.requiredProviderIds, requiredProviderIds)
    ) {
      return false;
    }
  }

  return true;
}

function matchingGenreIds(
  requestedGenreIds: readonly number[],
  candidateGenreIds: readonly number[],
): number[] {
  const candidateGenres = new Set(candidateGenreIds);
  const matches = new Set<number>();

  for (const genreId of requestedGenreIds) {
    if (candidateGenres.has(genreId)) {
      matches.add(genreId);
    }
  }

  return [...matches];
}

function preferredGenreEvidence(
  media: MediaSummary,
  request: RecommendationRequest,
): PreferredGenreScoreEvidence {
  const requestedGenreIds = [
    ...(request.softPreferences?.preferredGenreIds ?? []),
  ];
  const matchedGenreIds = matchingGenreIds(requestedGenreIds, media.genreIds);
  const points = Math.min(
    matchedGenreIds.length * RECOMMENDATION_WEIGHTS.preferredGenrePerMatch,
    RECOMMENDATION_WEIGHTS.preferredGenreMaximum,
  );

  return { requestedGenreIds, matchedGenreIds, points };
}

function moodEvidence(
  media: MediaSummary,
  request: RecommendationRequest,
): MoodScoreEvidence {
  const requestedMood = request.softPreferences?.mood ?? null;
  const mapping = getMoodMapping(requestedMood);
  const mediaGenreIds = new Set(media.genreIds);
  const matchedGenreIds = new Set<number>();
  const discoverySignals = new Set<"cross-genre-variety">();

  for (const signal of mapping?.signals ?? []) {
    if (signal.kind === "discovery") {
      discoverySignals.add(signal.key);
      continue;
    }

    if (
      signal.mediaTypes.includes(media.mediaType) &&
      mediaGenreIds.has(signal.genreId)
    ) {
      matchedGenreIds.add(signal.genreId);
    }
  }

  const matches = [...matchedGenreIds];
  const points =
    matches.length === 0
      ? 0
      : Math.min(
          RECOMMENDATION_WEIGHTS.moodFirstMatch +
            (matches.length - 1) * RECOMMENDATION_WEIGHTS.moodAdditionalMatch,
          RECOMMENDATION_WEIGHTS.moodMaximum,
        );

  return {
    requestedMood,
    matchedGenreIds: matches,
    discoverySignals: [...discoverySignals],
    points,
  };
}

function contentLanguageEvidence(
  media: MediaSummary,
  request: RecommendationRequest,
): ContentLanguageScoreEvidence {
  const requestedLanguage = request.softPreferences?.contentLanguage ?? null;
  const matched =
    requestedLanguage !== null && media.originalLanguage === requestedLanguage;

  return {
    requestedLanguage,
    actualLanguage: media.originalLanguage,
    matched,
    points: matched ? RECOMMENDATION_WEIGHTS.contentLanguageMatch : 0,
  };
}

function ratingConfidence(
  voteCount: number | null,
): Pick<RatingScoreEvidence, "confidenceTier" | "confidenceFactor"> {
  if (voteCount === null || voteCount === 0) {
    return { confidenceTier: "none", confidenceFactor: 0 };
  }

  if (voteCount <= 24) {
    return { confidenceTier: "low", confidenceFactor: 0.25 };
  }

  if (voteCount <= 99) {
    return { confidenceTier: "medium", confidenceFactor: 0.5 };
  }

  if (voteCount <= 499) {
    return { confidenceTier: "established", confidenceFactor: 0.75 };
  }

  return { confidenceTier: "high", confidenceFactor: 1 };
}

function ratingEvidence(media: MediaSummary): RatingScoreEvidence {
  const confidence = ratingConfidence(media.voteCount);
  const points =
    media.voteAverage === null
      ? 0
      : Math.min(
          Math.round(media.voteAverage * 2 * confidence.confidenceFactor),
          RECOMMENDATION_WEIGHTS.ratingMaximum,
        );

  return {
    voteAverage: media.voteAverage,
    voteCount: media.voteCount,
    ...confidence,
    points,
  };
}

function releaseYear(releaseDate: string | null): number | null {
  if (releaseDate === null) {
    return null;
  }

  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(releaseDate);
  const year = match === null ? Number.NaN : Number(match[1]);

  return Number.isInteger(year) && year > 0 ? year : null;
}

export function scoreRecommendationCandidate(
  candidate: TmdbDiscoveryCandidate,
  request: RecommendationRequest,
): RecommendationScoreBreakdown {
  const preferredGenres = preferredGenreEvidence(candidate.media, request);
  const mood = moodEvidence(candidate.media, request);
  const contentLanguage = contentLanguageEvidence(candidate.media, request);
  const rating = ratingEvidence(candidate.media);

  return {
    version: RECOMMENDATION_HEURISTIC_VERSION,
    preferredGenres,
    mood,
    contentLanguage,
    rating,
    releaseContext: {
      releaseYear: releaseYear(candidate.media.releaseDate),
      points: 0,
    },
    total:
      preferredGenres.points +
      mood.points +
      contentLanguage.points +
      rating.points,
  };
}

export interface RecommendationSessionExclusions {
  readonly shown?: readonly RecommendationMediaIdentity[];
  readonly removed?: readonly RecommendationMediaIdentity[];
}

export type TemporalCohesionClassification =
  "within-range" | "extreme-gap" | "unknown";

export interface TemporalCohesionEvidence {
  readonly applied: boolean;
  readonly anchorReleaseYear: number | null;
  readonly candidateReleaseYear: number | null;
  readonly yearGap: number | null;
  readonly classification: TemporalCohesionClassification;
  readonly affectedSelection: boolean;
}

export interface CrossGenreVarietyEvidence {
  readonly applied: boolean;
  readonly newGenreIds: readonly number[];
  readonly affectedSelection: boolean;
}

export interface RecommendationSelectionEvidence {
  readonly position: number;
  readonly temporalCohesion: TemporalCohesionEvidence;
  readonly crossGenreVariety: CrossGenreVarietyEvidence;
}

export interface SelectedRecommendation {
  readonly candidate: TmdbDiscoveryCandidate;
  readonly score: RecommendationScoreBreakdown;
  readonly selectionEvidence: RecommendationSelectionEvidence;
}

export interface RecommendationEngineResult {
  readonly status: "complete" | "limited";
  readonly requestedCount: typeof RECOMMENDATION_LIMIT;
  readonly eligibleCount: number;
  readonly recommendations: readonly SelectedRecommendation[];
}

interface RankedRecommendationCandidate {
  readonly candidate: TmdbDiscoveryCandidate;
  readonly score: RecommendationScoreBreakdown;
}

function sessionPreferencePoints(score: RecommendationScoreBreakdown): number {
  return (
    score.preferredGenres.points +
    score.mood.points +
    score.contentLanguage.points
  );
}

function compareRankedCandidates(
  first: RankedRecommendationCandidate,
  second: RankedRecommendationCandidate,
): number {
  const scoreDifference = second.score.total - first.score.total;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const sessionPreferenceDifference =
    sessionPreferencePoints(second.score) -
    sessionPreferencePoints(first.score);

  if (sessionPreferenceDifference !== 0) {
    return sessionPreferenceDifference;
  }

  const preferredGenreDifference =
    second.score.preferredGenres.points - first.score.preferredGenres.points;

  if (preferredGenreDifference !== 0) {
    return preferredGenreDifference;
  }

  const moodDifference = second.score.mood.points - first.score.mood.points;

  if (moodDifference !== 0) {
    return moodDifference;
  }

  const languageDifference =
    second.score.contentLanguage.points - first.score.contentLanguage.points;

  if (languageDifference !== 0) {
    return languageDifference;
  }

  const confidenceDifference =
    second.score.rating.confidenceFactor - first.score.rating.confidenceFactor;

  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  const ratingDifference =
    (second.score.rating.voteAverage ?? -1) -
    (first.score.rating.voteAverage ?? -1);

  if (ratingDifference !== 0) {
    return ratingDifference;
  }

  if (first.candidate.media.mediaType !== second.candidate.media.mediaType) {
    return first.candidate.media.mediaType === "movie" ? -1 : 1;
  }

  return first.candidate.media.id - second.candidate.media.id;
}

function newlyCoveredGenreIds(
  candidate: RankedRecommendationCandidate,
  selected: readonly RankedRecommendationCandidate[],
): number[] {
  const selectedGenreIds = new Set(
    selected.flatMap(({ candidate: selectedCandidate }) =>
      selectedCandidate.media.genreIds.slice(),
    ),
  );

  return [
    ...new Set(
      candidate.candidate.media.genreIds.filter(
        (genreId) => !selectedGenreIds.has(genreId),
      ),
    ),
  ].sort((first, second) => first - second);
}

function chooseWithVariety(
  candidates: readonly RankedRecommendationCandidate[],
  selected: readonly RankedRecommendationCandidate[],
  applyVariety: boolean,
): RankedRecommendationCandidate | null {
  const ordered = [...candidates].sort(compareRankedCandidates);

  if (!applyVariety || selected.length === 0) {
    return ordered[0] ?? null;
  }

  let choice: RankedRecommendationCandidate | null = null;
  let greatestNewGenreCount = -1;

  for (const candidate of ordered) {
    const newGenreCount = newlyCoveredGenreIds(candidate, selected).length;

    if (newGenreCount > greatestNewGenreCount) {
      choice = candidate;
      greatestNewGenreCount = newGenreCount;
    }
  }

  return choice;
}

function temporalClassification(
  anchorReleaseYear: number | null,
  candidateReleaseYear: number | null,
): {
  readonly yearGap: number | null;
  readonly classification: TemporalCohesionClassification;
} {
  if (anchorReleaseYear === null || candidateReleaseYear === null) {
    return { yearGap: null, classification: "unknown" };
  }

  const yearGap = Math.abs(anchorReleaseYear - candidateReleaseYear);

  return {
    yearGap,
    classification:
      yearGap > TEMPORAL_COHESION_MAX_YEAR_GAP ? "extreme-gap" : "within-range",
  };
}

function candidateKey(candidate: RankedRecommendationCandidate): string {
  return recommendationMediaKey(candidate.candidate.media);
}

export function selectRecommendations(
  candidates: readonly TmdbDiscoveryCandidate[],
  request: RecommendationRequest,
  sessionExclusions: RecommendationSessionExclusions = {},
): RecommendationEngineResult {
  const excludedSessionKeys = new Set(
    [
      ...(sessionExclusions.shown ?? []),
      ...(sessionExclusions.removed ?? []),
    ].map(recommendationMediaKey),
  );
  const eligibleByKey = new Map<string, TmdbDiscoveryCandidate>();

  for (const candidate of candidates) {
    const key = recommendationMediaKey(candidate.media);

    if (
      excludedSessionKeys.has(key) ||
      !candidateSatisfiesHardRestrictions(candidate, request)
    ) {
      continue;
    }

    if (!eligibleByKey.has(key)) {
      eligibleByKey.set(key, candidate);
    }
  }

  let remaining: RankedRecommendationCandidate[] = [
    ...eligibleByKey.values(),
  ].map((candidate) => ({
    candidate,
    score: scoreRecommendationCandidate(candidate, request),
  }));
  const eligibleCount = remaining.length;
  const selected: RankedRecommendationCandidate[] = [];
  const recommendations: SelectedRecommendation[] = [];

  while (
    remaining.length > 0 &&
    recommendations.length < RECOMMENDATION_LIMIT
  ) {
    const orderedRemaining = [...remaining].sort(compareRankedCandidates);
    const leadingCandidate = orderedRemaining[0];

    if (leadingCandidate === undefined) {
      break;
    }

    const nearFitCandidates = orderedRemaining.filter(
      ({ score }) =>
        score.total >=
        leadingCandidate.score.total - TEMPORAL_COHESION_SCORE_WINDOW,
    );
    const greatestSessionPreferencePoints = Math.max(
      ...nearFitCandidates.map(({ score }) => sessionPreferencePoints(score)),
    );
    const currentPreferenceCandidates = nearFitCandidates.filter(
      ({ score }) =>
        sessionPreferencePoints(score) === greatestSessionPreferencePoints,
    );
    const anchorReleaseYear =
      selected[0]?.score.releaseContext.releaseYear ?? null;
    const nonExtremeCandidates = currentPreferenceCandidates.filter(
      ({ score }) =>
        temporalClassification(
          anchorReleaseYear,
          score.releaseContext.releaseYear,
        ).classification !== "extreme-gap",
    );
    const temporalCandidates =
      selected.length > 0 &&
      anchorReleaseYear !== null &&
      nonExtremeCandidates.length > 0
        ? nonExtremeCandidates
        : currentPreferenceCandidates;
    const applyVariety =
      request.softPreferences?.mood === "surprised" && selected.length > 0;
    const choiceWithoutTemporalCohesion = chooseWithVariety(
      currentPreferenceCandidates,
      selected,
      applyVariety,
    );
    const choiceWithoutVariety =
      [...temporalCandidates].sort(compareRankedCandidates)[0] ?? null;
    const choice = chooseWithVariety(
      temporalCandidates,
      selected,
      applyVariety,
    );

    if (choice === null) {
      break;
    }

    const candidateReleaseYear = choice.score.releaseContext.releaseYear;
    const firstSelection = selected.length === 0;
    const effectiveAnchorReleaseYear = firstSelection
      ? candidateReleaseYear
      : anchorReleaseYear;
    const temporal = temporalClassification(
      effectiveAnchorReleaseYear,
      candidateReleaseYear,
    );
    const newGenreIds = applyVariety
      ? newlyCoveredGenreIds(choice, selected)
      : [];

    recommendations.push({
      candidate: choice.candidate,
      score: choice.score,
      selectionEvidence: {
        position: recommendations.length + 1,
        temporalCohesion: {
          applied: !firstSelection && anchorReleaseYear !== null,
          anchorReleaseYear: effectiveAnchorReleaseYear,
          candidateReleaseYear,
          ...temporal,
          affectedSelection:
            choiceWithoutTemporalCohesion !== null &&
            candidateKey(choiceWithoutTemporalCohesion) !==
              candidateKey(choice),
        },
        crossGenreVariety: {
          applied: applyVariety,
          newGenreIds,
          affectedSelection:
            applyVariety &&
            choiceWithoutVariety !== null &&
            candidateKey(choiceWithoutVariety) !== candidateKey(choice),
        },
      },
    });
    selected.push(choice);
    remaining = remaining.filter(
      (candidate) => candidateKey(candidate) !== candidateKey(choice),
    );
  }

  return {
    status: eligibleCount >= RECOMMENDATION_LIMIT ? "complete" : "limited",
    requestedCount: RECOMMENDATION_LIMIT,
    eligibleCount,
    recommendations,
  };
}
