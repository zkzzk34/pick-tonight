import type { MediaSummary } from "../shared/media-contracts.ts";
import type {
  ProductRecommendation,
  ProductRecommendationRequest,
  ProductTitleDetail,
} from "../shared/product-api-contracts.ts";
import { discoverTmdbCandidates } from "./tmdb-discovery.ts";
import {
  recommendationMediaKey,
  selectRecommendations,
  type RecommendationMediaIdentity,
  type SelectedRecommendation,
} from "./recommendation-engine.ts";
import { fetchTmdbTitleDetails } from "./tmdb-title-client.ts";
import type { TmdbTitleDetails } from "./tmdb-title-normalization.ts";

type DiscoverCandidates = typeof discoverTmdbCandidates;
type FetchTitleDetails = typeof fetchTmdbTitleDetails;

export interface ProductApiServiceDependencies {
  readonly discoverCandidates?: DiscoverCandidates;
  readonly fetchTitleDetails?: FetchTitleDetails;
}

function releaseYear(releaseDate: string | null): number | null {
  if (releaseDate === null) {
    return null;
  }

  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(releaseDate);
  const year = match === null ? Number.NaN : Number(match[1]);

  return Number.isInteger(year) && year > 0 ? year : null;
}

function freshnessForTitle(
  mediaType: MediaSummary["mediaType"],
  releaseDate: string | null,
): ProductRecommendation["freshness"] {
  const year = releaseYear(releaseDate);

  if (year === null) {
    return null;
  }

  return mediaType === "movie"
    ? {
        label: `Released in ${year}`,
        basis: "release-date",
      }
    : {
        label: `First aired in ${year}`,
        basis: "first-air-date",
      };
}

function displayRatingConfidence(
  voteCount: number | null,
): "none" | "low" | "medium" | "established" | "high" {
  if (voteCount === null || voteCount === 0) {
    return "none";
  }

  if (voteCount <= 24) {
    return "low";
  }

  if (voteCount <= 99) {
    return "medium";
  }

  if (voteCount < 500) {
    return "established";
  }

  return "high";
}

function ratingForTitle(
  details: TmdbTitleDetails,
): ProductRecommendation["rating"] {
  if (details.voteAverage === null) {
    return null;
  }

  return {
    average: details.voteAverage,
    voteCount: details.voteCount,
    confidence: displayRatingConfidence(details.voteCount),
  };
}

function cardProviderAvailability(
  details: TmdbTitleDetails,
): ProductRecommendation["providerAvailability"] {
  const availability = details.providerAvailability;

  if (availability === null) {
    return null;
  }

  const providerNames = [
    ...new Set(
      [
        ...availability.streaming,
        ...availability.free,
        ...availability.advertising,
        ...availability.rental,
        ...availability.purchase,
      ].map(({ name }) => name),
    ),
  ];

  if (providerNames.length === 0) {
    return null;
  }

  return {
    source: availability.source,
    watchRegion: availability.watchRegion,
    providerNames,
  };
}

function titleProviderAvailability(
  details: TmdbTitleDetails,
): ProductTitleDetail["providerAvailability"] {
  const availability = details.providerAvailability;

  if (availability === null) {
    return null;
  }

  return {
    source: availability.source,
    watchRegion: availability.watchRegion,
    tmdbUrl: availability.tmdbUrl,
    streaming: availability.streaming.map(({ name }) => name),
    free: availability.free.map(({ name }) => name),
    ads: availability.advertising.map(({ name }) => name),
    rent: availability.rental.map(({ name }) => name),
    buy: availability.purchase.map(({ name }) => name),
  };
}

function mediaIdentityFromKey(mediaKey: string): RecommendationMediaIdentity {
  const match = /^(movie|tv):([1-9]\d*)$/.exec(mediaKey);

  if (match === null) {
    throw new TypeError("Invalid product media key.");
  }

  const mediaType = match[1];
  const id = Number(match[2]);

  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    throw new TypeError("Invalid product media key.");
  }

  return { mediaType, id };
}

function mapRecommendation(
  selected: SelectedRecommendation,
  details: TmdbTitleDetails,
): ProductRecommendation {
  return {
    mediaKey: recommendationMediaKey(selected.candidate.media),
    title: details.title,
    year: releaseYear(details.releaseDate),
    mediaType: details.mediaType,
    decisionEvidence: {
      candidateAgeCode: selected.score.rating.ageState,
      ratingConfidenceCode: selected.score.rating.confidenceState,
    },
    overview: details.overview,
    posterUrl: details.posterUrl,
    genres: details.genres.map(({ name }) => name),
    runtime: details.runtime,
    rating: ratingForTitle(details),
    freshness: freshnessForTitle(details.mediaType, details.releaseDate),
    providerAvailability: cardProviderAvailability(details),
    trailerUrl: details.trailerUrl,
    explanation: selected.explanation,
  };
}

export async function createProductRecommendations(
  input: ProductRecommendationRequest,
  {
    discoverCandidates = discoverTmdbCandidates,
    fetchTitleDetails = fetchTmdbTitleDetails,
  }: ProductApiServiceDependencies = {},
): Promise<ProductRecommendation[]> {
  const discovery = await discoverCandidates(input.request);

  const selection = selectRecommendations(discovery.candidates, input.request, {
    shown: (input.exclusions?.shownMediaKeys ?? []).map(mediaIdentityFromKey),
    removed: (input.exclusions?.removedMediaKeys ?? []).map(
      mediaIdentityFromKey,
    ),
  });

  if (selection.recommendations.length < input.requestedCount) {
    return [];
  }

  const selected = selection.recommendations.slice(0, input.requestedCount);

  const details = await Promise.all(
    selected.map(({ candidate }) =>
      fetchTitleDetails(candidate.media.mediaType, candidate.media.id, {
        watchRegion: input.request.watchRegion,
      }),
    ),
  );

  return selected.map((recommendation, index) => {
    const detail = details[index];

    if (detail === undefined) {
      throw new Error("Recommendation enrichment did not complete.");
    }

    return mapRecommendation(recommendation, detail);
  });
}

export async function createProductTitleDetail(
  mediaType: MediaSummary["mediaType"],
  id: number,
  watchRegion: string,
  {
    fetchTitleDetails = fetchTmdbTitleDetails,
  }: ProductApiServiceDependencies = {},
): Promise<ProductTitleDetail> {
  const details = await fetchTitleDetails(mediaType, id, {
    watchRegion,
  });

  return {
    mediaKey: recommendationMediaKey({
      mediaType: details.mediaType,
      id: details.id,
    }),
    title: details.title,
    year: releaseYear(details.releaseDate),
    mediaType: details.mediaType,
    overview: details.overview,
    posterUrl: details.posterUrl,
    genres: details.genres.map(({ name }) => name),
    runtime: details.runtime,
    rating: ratingForTitle(details),
    freshness: freshnessForTitle(details.mediaType, details.releaseDate),
    watchRegion,
    providerAvailability: titleProviderAvailability(details),
    trailerUrl: details.trailerUrl,
  };
}
