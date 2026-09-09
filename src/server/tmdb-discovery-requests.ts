import type { MediaSummary } from "../shared/media-contracts.ts";
import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";
import type { TmdbDiscoverySource } from "./tmdb-discovery-candidates.ts";

const DEFAULT_RESPONSE_LANGUAGE = "en-US";
const FIRST_PAGE = "1";

type MediaType = MediaSummary["mediaType"];

interface TmdbMediaRequestConfiguration {
  readonly discoverSource: TmdbDiscoverySource;
  readonly trendingSource: TmdbDiscoverySource;
  readonly currentSource: TmdbDiscoverySource;
  readonly discoverPathname: string;
  readonly trendingPathname: string;
  readonly currentPathname: string;
}

const MEDIA_REQUEST_CONFIGURATIONS = {
  movie: {
    discoverSource: "discover-movie",
    trendingSource: "trending-movie-week",
    currentSource: "now-playing",
    discoverPathname: "/discover/movie",
    trendingPathname: "/trending/movie/week",
    currentPathname: "/movie/now_playing",
  },
  tv: {
    discoverSource: "discover-tv",
    trendingSource: "trending-tv-week",
    currentSource: "on-the-air",
    discoverPathname: "/discover/tv",
    trendingPathname: "/trending/tv/week",
    currentPathname: "/tv/on_the_air",
  },
} as const satisfies Record<MediaType, TmdbMediaRequestConfiguration>;

const BOTH_MEDIA_TYPES: readonly MediaType[] = ["movie", "tv"];

export interface TmdbDiscoveryRequestPlan {
  readonly source: TmdbDiscoverySource;
  readonly mediaType: MediaType;
  readonly pathname: string;
  readonly searchParameters: Readonly<Record<string, string>>;
  readonly appliedMaximumRuntimeRestriction: boolean;
  readonly appliedProviderRestriction: boolean;
}

function requestedMediaTypes(
  request: RecommendationRequest,
): readonly MediaType[] {
  const requestedMediaType = request.hardRestrictions?.mediaType;

  return requestedMediaType === "movie" || requestedMediaType === "tv"
    ? [requestedMediaType]
    : BOTH_MEDIA_TYPES;
}

function createDiscoverSearchParameters(
  mediaType: MediaType,
  request: RecommendationRequest,
): Record<string, string> {
  const parameters: Record<string, string> = {
    include_adult: "false",
    language: DEFAULT_RESPONSE_LANGUAGE,
    page: FIRST_PAGE,
    sort_by: "popularity.desc",
  };

  if (mediaType === "movie") {
    parameters.include_video = "false";

    if (request.watchRegion !== undefined) {
      parameters.region = request.watchRegion;
    }
  } else {
    parameters.include_null_first_air_dates = "false";
  }

  const hardRestrictions = request.hardRestrictions;

  if (
    hardRestrictions?.excludedGenreIds !== undefined &&
    hardRestrictions.excludedGenreIds.length > 0
  ) {
    parameters.without_genres = hardRestrictions.excludedGenreIds.join("|");
  }

  if (hardRestrictions?.maximumRuntimeMinutes !== undefined) {
    parameters["with_runtime.lte"] = String(
      hardRestrictions.maximumRuntimeMinutes,
    );
  }

  if (
    hardRestrictions?.requiredProviderIds !== undefined &&
    request.watchRegion !== undefined
  ) {
    parameters.watch_region = request.watchRegion;
    parameters.with_watch_providers =
      hardRestrictions.requiredProviderIds.join("|");
  }

  const softPreferences = request.softPreferences;

  if (
    softPreferences?.preferredGenreIds !== undefined &&
    softPreferences.preferredGenreIds.length > 0
  ) {
    parameters.with_genres = softPreferences.preferredGenreIds.join("|");
  }

  if (softPreferences?.contentLanguage !== undefined) {
    parameters.with_original_language = softPreferences.contentLanguage;
  }

  if (softPreferences?.originCountry !== undefined) {
    parameters.with_origin_country = softPreferences.originCountry;
  }

  return parameters;
}

function createCurrentSearchParameters(
  mediaType: MediaType,
  request: RecommendationRequest,
): Record<string, string> {
  const parameters: Record<string, string> = {
    language: DEFAULT_RESPONSE_LANGUAGE,
    page: FIRST_PAGE,
  };

  if (mediaType === "movie" && request.watchRegion !== undefined) {
    parameters.region = request.watchRegion;
  }

  return parameters;
}

function createPlansForMediaType(
  mediaType: MediaType,
  request: RecommendationRequest,
): TmdbDiscoveryRequestPlan[] {
  const configuration = MEDIA_REQUEST_CONFIGURATIONS[mediaType];
  const appliedMaximumRuntimeRestriction =
    request.hardRestrictions?.maximumRuntimeMinutes !== undefined;
  const appliedProviderRestriction =
    request.hardRestrictions?.requiredProviderIds !== undefined &&
    request.watchRegion !== undefined;

  return [
    {
      source: configuration.discoverSource,
      mediaType,
      pathname: configuration.discoverPathname,
      searchParameters: createDiscoverSearchParameters(mediaType, request),
      appliedMaximumRuntimeRestriction,
      appliedProviderRestriction,
    },
    {
      source: configuration.trendingSource,
      mediaType,
      pathname: configuration.trendingPathname,
      searchParameters: {
        language: DEFAULT_RESPONSE_LANGUAGE,
      },
      appliedMaximumRuntimeRestriction: false,
      appliedProviderRestriction: false,
    },
    {
      source: configuration.currentSource,
      mediaType,
      pathname: configuration.currentPathname,
      searchParameters: createCurrentSearchParameters(mediaType, request),
      appliedMaximumRuntimeRestriction: false,
      appliedProviderRestriction: false,
    },
  ];
}

export function createTmdbDiscoveryRequestPlans(
  request: RecommendationRequest,
): TmdbDiscoveryRequestPlan[] {
  const plans: TmdbDiscoveryRequestPlan[] = [];

  for (const mediaType of requestedMediaTypes(request)) {
    plans.push(...createPlansForMediaType(mediaType, request));
  }

  return plans;
}
