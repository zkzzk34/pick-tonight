import {
  mediaSummarySchema,
  type MediaSummary,
} from "../shared/media-contracts.ts";

const NORMALIZATION_ERROR_MESSAGE =
  "The TMDB media result cannot be normalized.";

type UnknownRecord = Record<string, unknown>;
type MediaSummaryType = MediaSummary["mediaType"];

interface TmdbResultFieldMap {
  readonly mediaType: MediaSummaryType;
  readonly titleKey: "title" | "name";
  readonly originalTitleKey: "original_title" | "original_name";
  readonly releaseDateKey: "release_date" | "first_air_date";
}

const MOVIE_RESULT_FIELDS = {
  mediaType: "movie",
  titleKey: "title",
  originalTitleKey: "original_title",
  releaseDateKey: "release_date",
} as const satisfies TmdbResultFieldMap;

const TV_RESULT_FIELDS = {
  mediaType: "tv",
  titleKey: "name",
  originalTitleKey: "original_name",
  releaseDateKey: "first_air_date",
} as const satisfies TmdbResultFieldMap;

export class TmdbNormalizationError extends Error {
  constructor() {
    super(NORMALIZATION_ERROR_MESSAGE);
    this.name = "TmdbNormalizationError";
  }
}

function recordOrNull(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function dateOrNull(value: unknown): string | null {
  const text = textOrNull(value);

  if (text === null) {
    return null;
  }

  const parsedDate = mediaSummarySchema.shape.releaseDate.safeParse(text);
  return parsedDate.success ? parsedDate.data : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function nonnegativeIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function nonnegativeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function ratingOrNull(value: unknown): number | null {
  const rating = nonnegativeNumberOrNull(value);
  return rating !== null && rating <= 10 ? rating : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function genreIdsOrEmpty(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (genreId): genreId is number =>
      typeof genreId === "number" && Number.isInteger(genreId) && genreId > 0,
  );
}

function normalizeTmdbResult(
  value: unknown,
  fields: TmdbResultFieldMap,
): MediaSummary {
  const result = recordOrNull(value);

  if (result === null) {
    throw new TmdbNormalizationError();
  }

  const id = positiveIntegerOrNull(result.id);
  const title = textOrNull(result[fields.titleKey]);

  if (id === null || title === null) {
    throw new TmdbNormalizationError();
  }

  const normalizedResult = mediaSummarySchema.safeParse({
    source: "tmdb",
    mediaType: fields.mediaType,
    id,
    title,
    originalTitle: textOrNull(result[fields.originalTitleKey]),
    overview: textOrNull(result.overview),
    releaseDate: dateOrNull(result[fields.releaseDateKey]),
    originalLanguage: textOrNull(result.original_language),
    genreIds: genreIdsOrEmpty(result.genre_ids),
    posterPath: textOrNull(result.poster_path),
    backdropPath: textOrNull(result.backdrop_path),
    popularity: nonnegativeNumberOrNull(result.popularity),
    voteAverage: ratingOrNull(result.vote_average),
    voteCount: nonnegativeIntegerOrNull(result.vote_count),
    adult: booleanOrNull(result.adult),
  });

  if (!normalizedResult.success) {
    throw new TmdbNormalizationError();
  }

  return normalizedResult.data;
}

export function normalizeTmdbMovieResult(value: unknown): MediaSummary {
  return normalizeTmdbResult(value, MOVIE_RESULT_FIELDS);
}

export function normalizeTmdbTvResult(value: unknown): MediaSummary {
  return normalizeTmdbResult(value, TV_RESULT_FIELDS);
}
