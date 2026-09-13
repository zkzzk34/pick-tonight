import type { MediaSummary } from "../shared/media-contracts.ts";

export const DEFAULT_TMDB_TITLE_LANGUAGE = "en-US";
export const TMDB_TITLE_REQUEST_ERROR_MESSAGE =
  "The TMDB title request is invalid.";

export class TmdbTitleRequestError extends Error {
  constructor() {
    super(TMDB_TITLE_REQUEST_ERROR_MESSAGE);
    this.name = "TmdbTitleRequestError";
  }
}

export type TmdbTitleRequestKind =
  "details" | "images" | "videos" | "watch-providers";

export interface TmdbTitleRequestPlan {
  readonly kind: TmdbTitleRequestKind;
  readonly mediaType: MediaSummary["mediaType"];
  readonly id: number;
  readonly pathname: string;
  readonly searchParameters: Readonly<Record<string, string>>;
}

export interface TmdbTitleRequestPlans {
  readonly mediaType: MediaSummary["mediaType"];
  readonly id: number;
  readonly language: string;
  readonly watchRegion: string | null;
  readonly details: TmdbTitleRequestPlan;
  readonly images: TmdbTitleRequestPlan;
  readonly videos: TmdbTitleRequestPlan;
  readonly watchProviders: TmdbTitleRequestPlan | null;
}

export interface TmdbTitleRequestOptions {
  readonly language?: string;
  readonly watchRegion?: string;
}

function requestError(): TmdbTitleRequestError {
  return new TmdbTitleRequestError();
}

function checkedMediaType(
  mediaType: MediaSummary["mediaType"],
): MediaSummary["mediaType"] {
  if (mediaType !== "movie" && mediaType !== "tv") {
    throw requestError();
  }

  return mediaType;
}

function checkedId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw requestError();
  }

  return id;
}

function canonicalLanguage(language: string): string {
  const match = /^([A-Za-z]{2})(?:-([A-Za-z]{2}))?$/.exec(language.trim());

  if (match === null) {
    throw requestError();
  }

  const languageCode = match[1].toLowerCase();
  const countryCode = match[2]?.toUpperCase();

  return countryCode === undefined
    ? languageCode
    : `${languageCode}-${countryCode}`;
}

function canonicalRegion(region: string): string {
  const canonical = region.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(canonical)) {
    throw requestError();
  }

  return canonical;
}

function createPlan(
  kind: TmdbTitleRequestKind,
  mediaType: MediaSummary["mediaType"],
  id: number,
  pathname: string,
  searchParameters: Readonly<Record<string, string>>,
): TmdbTitleRequestPlan {
  return { kind, mediaType, id, pathname, searchParameters };
}

export function createTmdbTitleRequestPlans(
  mediaType: MediaSummary["mediaType"],
  id: number,
  {
    language = DEFAULT_TMDB_TITLE_LANGUAGE,
    watchRegion,
  }: TmdbTitleRequestOptions = {},
): TmdbTitleRequestPlans {
  const checkedType = checkedMediaType(mediaType);
  const checkedTitleId = checkedId(id);
  const checkedLanguage = canonicalLanguage(language);
  const checkedRegion =
    watchRegion === undefined ? null : canonicalRegion(watchRegion);
  const titlePathname = `/${checkedType}/${checkedTitleId}`;
  const localizedParameters = { language: checkedLanguage };

  return {
    mediaType: checkedType,
    id: checkedTitleId,
    language: checkedLanguage,
    watchRegion: checkedRegion,
    details: createPlan(
      "details",
      checkedType,
      checkedTitleId,
      titlePathname,
      localizedParameters,
    ),
    images: createPlan(
      "images",
      checkedType,
      checkedTitleId,
      `${titlePathname}/images`,
      {
        language: checkedLanguage,
        include_image_language: `${checkedLanguage},null`,
      },
    ),
    videos: createPlan(
      "videos",
      checkedType,
      checkedTitleId,
      `${titlePathname}/videos`,
      localizedParameters,
    ),
    watchProviders:
      checkedRegion === null
        ? null
        : createPlan(
            "watch-providers",
            checkedType,
            checkedTitleId,
            `${titlePathname}/watch/providers`,
            {},
          ),
  };
}
