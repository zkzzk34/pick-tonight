import type { MediaSummary } from "../shared/media-contracts.ts";
import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";

export const TMDB_DISCOVERY_SOURCES = [
  "discover-movie",
  "trending-movie-week",
  "now-playing",
  "discover-tv",
  "trending-tv-week",
  "on-the-air",
] as const;

export type TmdbDiscoverySource = (typeof TMDB_DISCOVERY_SOURCES)[number];

export interface TmdbDiscoveryBatch {
  readonly source: TmdbDiscoverySource;
  readonly mediaType: MediaSummary["mediaType"];
  readonly candidates: readonly MediaSummary[];
  readonly appliedMaximumRuntimeRestriction: boolean;
  readonly appliedProviderRestriction: boolean;
}

export interface TmdbDiscoveryCandidate {
  readonly media: MediaSummary;
  readonly sources: readonly TmdbDiscoverySource[];
}

interface CandidateAccumulator {
  readonly media: MediaSummary;
  readonly sources: TmdbDiscoverySource[];
  appliedMaximumRuntimeRestriction: boolean;
  appliedProviderRestriction: boolean;
}

function candidateKey(media: MediaSummary): string {
  return `${media.mediaType}:${media.id}`;
}

export function createTmdbDiscoveryCandidatePool(
  batches: readonly TmdbDiscoveryBatch[],
  request: RecommendationRequest,
): TmdbDiscoveryCandidate[] {
  const requestedMediaType = request.hardRestrictions?.mediaType;
  const excludedGenreIds = new Set(
    request.hardRestrictions?.excludedGenreIds ?? [],
  );
  const requiresMaximumRuntime =
    request.hardRestrictions?.maximumRuntimeMinutes !== undefined;
  const requiresProvider =
    request.hardRestrictions?.requiredProviderIds !== undefined;
  const rejectedKeys = new Set<string>();
  const candidatesByKey = new Map<string, CandidateAccumulator>();

  for (const batch of batches) {
    for (const media of batch.candidates) {
      if (
        requestedMediaType !== undefined &&
        requestedMediaType !== "either" &&
        media.mediaType !== requestedMediaType
      ) {
        continue;
      }

      if (media.mediaType !== batch.mediaType) {
        continue;
      }

      const key = candidateKey(media);

      if (rejectedKeys.has(key)) {
        continue;
      }

      const violatesAdultRestriction = media.adult === true;
      const violatesGenreRestriction = media.genreIds.some((genreId) =>
        excludedGenreIds.has(genreId),
      );

      if (violatesAdultRestriction || violatesGenreRestriction) {
        rejectedKeys.add(key);
        candidatesByKey.delete(key);
        continue;
      }

      const existingCandidate = candidatesByKey.get(key);

      if (existingCandidate === undefined) {
        candidatesByKey.set(key, {
          media,
          sources: [batch.source],
          appliedMaximumRuntimeRestriction:
            batch.appliedMaximumRuntimeRestriction,
          appliedProviderRestriction: batch.appliedProviderRestriction,
        });
        continue;
      }

      if (!existingCandidate.sources.includes(batch.source)) {
        existingCandidate.sources.push(batch.source);
      }

      existingCandidate.appliedMaximumRuntimeRestriction ||=
        batch.appliedMaximumRuntimeRestriction;
      existingCandidate.appliedProviderRestriction ||=
        batch.appliedProviderRestriction;
    }
  }

  return [...candidatesByKey.values()]
    .filter(
      (candidate) =>
        (!requiresMaximumRuntime ||
          candidate.appliedMaximumRuntimeRestriction) &&
        (!requiresProvider || candidate.appliedProviderRestriction),
    )
    .map(({ media, sources }) => ({ media, sources }));
}
