import type { MediaSummary } from "../shared/media-contracts.ts";
import type { TmdbImageConfiguration } from "./tmdb-reference-normalization.ts";

export const TMDB_TITLE_NORMALIZATION_ERROR_MESSAGE =
  "TMDB returned title data that PickTonight could not read.";

export class TmdbTitleNormalizationError extends Error {
  constructor() {
    super(TMDB_TITLE_NORMALIZATION_ERROR_MESSAGE);
    this.name = "TmdbTitleNormalizationError";
  }
}

export interface TmdbTitleGenre {
  readonly id: number;
  readonly name: string;
}

export type TmdbTitleRuntime =
  | { readonly kind: "movie"; readonly minutes: number }
  | { readonly kind: "episode"; readonly minutes: number };

export interface TmdbTitleProvider {
  readonly id: number;
  readonly name: string;
  readonly logoUrl: string | null;
}

export interface TmdbTitleProviderAvailability {
  readonly source: "justwatch";
  readonly watchRegion: string;
  readonly tmdbUrl: string | null;
  readonly streaming: readonly TmdbTitleProvider[];
  readonly free: readonly TmdbTitleProvider[];
  readonly advertising: readonly TmdbTitleProvider[];
  readonly rental: readonly TmdbTitleProvider[];
  readonly purchase: readonly TmdbTitleProvider[];
}

export interface TmdbTitleDetails {
  readonly source: "tmdb";
  readonly mediaType: MediaSummary["mediaType"];
  readonly id: number;
  readonly title: string;
  readonly originalTitle: string | null;
  readonly overview: string | null;
  readonly releaseDate: string | null;
  readonly originalLanguage: string | null;
  readonly genres: readonly TmdbTitleGenre[];
  readonly runtime: TmdbTitleRuntime | null;
  readonly posterUrl: string | null;
  readonly backdropUrl: string | null;
  readonly voteAverage: number | null;
  readonly voteCount: number | null;
  readonly adult: boolean | null;
  readonly trailerUrl: string | null;
  readonly providerAvailability: TmdbTitleProviderAvailability | null;
}

export interface TmdbTitleNormalizationInput {
  readonly mediaType: MediaSummary["mediaType"];
  readonly id: number;
  readonly watchRegion?: string;
  readonly detailPayload: unknown;
  readonly imagePayload: unknown;
  readonly videoPayload: unknown;
  readonly providerPayload?: unknown;
  readonly imageConfiguration: TmdbImageConfiguration;
}

type UnknownRecord = Record<string, unknown>;
type ImageKind = "backdrop" | "logo" | "poster";

const VIDEO_TYPE_PRIORITY = [
  "Trailer",
  "Teaser",
  "Clip",
  "Featurette",
] as const;
const VIDEO_SITE_PRIORITY = ["YouTube", "Vimeo"] as const;

function normalizationError(): TmdbTitleNormalizationError {
  return new TmdbTitleNormalizationError();
}

function recordOrNull(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
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

function ratingOrNull(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
    ? value
    : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function dateOrNull(value: unknown): string | null {
  const text = textOrNull(value);

  if (text === null || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const timestamp = Date.parse(`${text}T00:00:00Z`);

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === text
    ? text
    : null;
}

function relativeImagePathOrNull(value: unknown): string | null {
  const path = textOrNull(value);

  return path !== null &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !path.includes("?") &&
    !path.includes("#") &&
    !path.split("/").includes("..")
    ? path
    : null;
}

function normalizeGenres(value: unknown): TmdbTitleGenre[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const genres: TmdbTitleGenre[] = [];
  const seenIds = new Set<number>();

  for (const candidate of value) {
    const genre = recordOrNull(candidate);
    const id = positiveIntegerOrNull(genre?.id);
    const name = textOrNull(genre?.name);

    if (id !== null && name !== null && !seenIds.has(id)) {
      seenIds.add(id);
      genres.push({ id, name });
    }
  }

  return genres;
}

function normalizeRuntime(
  details: UnknownRecord,
  mediaType: MediaSummary["mediaType"],
): TmdbTitleRuntime | null {
  if (mediaType === "movie") {
    const minutes = positiveIntegerOrNull(details.runtime);
    return minutes === null ? null : { kind: "movie", minutes };
  }

  if (!Array.isArray(details.episode_run_time)) {
    return null;
  }

  for (const value of details.episode_run_time) {
    const minutes = positiveIntegerOrNull(value);

    if (minutes !== null) {
      return { kind: "episode", minutes };
    }
  }

  return null;
}

function configuredSizeOrNull(sizes: readonly string[]): string | null {
  let selected: { readonly name: string; readonly pixels: number } | null =
    null;
  let originalIsAvailable = false;

  for (const value of sizes) {
    const size = textOrNull(value);

    if (size === "original") {
      originalIsAvailable = true;
      continue;
    }

    const match = size === null ? null : /^[wh](\d+)$/.exec(size);
    const pixels = match === null ? null : Number(match[1]);

    if (
      size !== null &&
      pixels !== null &&
      Number.isSafeInteger(pixels) &&
      pixels > 0 &&
      (selected === null || pixels > selected.pixels)
    ) {
      selected = { name: size, pixels };
    }
  }

  return selected?.name ?? (originalIsAvailable ? "original" : null);
}

function secureImageBaseUrlOrNull(value: unknown): string | null {
  const text = textOrNull(value);

  if (text === null) {
    return null;
  }

  try {
    const url = new URL(text);

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }

    return text.endsWith("/") ? text : `${text}/`;
  } catch {
    return null;
  }
}

function imageSizes(
  configuration: TmdbImageConfiguration,
  kind: ImageKind,
): readonly string[] {
  if (kind === "backdrop") {
    return configuration.backdropSizes;
  }

  if (kind === "logo") {
    return configuration.logoSizes;
  }

  return configuration.posterSizes;
}

function buildImageUrl(
  path: string | null,
  configuration: TmdbImageConfiguration,
  kind: ImageKind,
): string | null {
  if (path === null) {
    return null;
  }

  const baseUrl = secureImageBaseUrlOrNull(configuration.secureBaseUrl);
  const size = configuredSizeOrNull(imageSizes(configuration, kind));

  if (baseUrl === null || size === null) {
    throw normalizationError();
  }

  const url = new URL(`${size}/${path.slice(1)}`, baseUrl);
  return url.protocol === "https:" ? url.toString() : null;
}

function requiredImageCollections(
  payload: unknown,
  requestedId: number,
): {
  readonly backdrops: readonly unknown[];
  readonly posters: readonly unknown[];
} {
  const record = recordOrNull(payload);

  if (
    record === null ||
    positiveIntegerOrNull(record.id) !== requestedId ||
    !Array.isArray(record.backdrops) ||
    !Array.isArray(record.posters)
  ) {
    throw normalizationError();
  }

  return {
    backdrops: record.backdrops,
    posters: record.posters,
  };
}

function firstImagePath(images: readonly unknown[]): string | null {
  for (const candidate of images) {
    const path = relativeImagePathOrNull(recordOrNull(candidate)?.file_path);

    if (path !== null) {
      return path;
    }
  }

  return null;
}

function videoUrl(site: string, key: string): string | null {
  if (site === "YouTube") {
    const url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", key);
    return url.toString();
  }

  if (site === "Vimeo") {
    return `https://vimeo.com/${encodeURIComponent(key)}`;
  }

  return null;
}

function selectOfficialVideo(
  payload: unknown,
  requestedId: number,
): string | null {
  const record = recordOrNull(payload);

  if (
    record === null ||
    positiveIntegerOrNull(record.id) !== requestedId ||
    !Array.isArray(record.results)
  ) {
    throw normalizationError();
  }

  for (const preferredType of VIDEO_TYPE_PRIORITY) {
    for (const preferredSite of VIDEO_SITE_PRIORITY) {
      for (const candidate of record.results) {
        const video = recordOrNull(candidate);
        const key = textOrNull(video?.key);

        if (
          video?.official === true &&
          video.type === preferredType &&
          video.site === preferredSite &&
          key !== null &&
          key.length <= 200
        ) {
          return videoUrl(preferredSite, key);
        }
      }
    }
  }

  return null;
}

function canonicalRegion(region: string): string {
  const canonical = region.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(canonical)) {
    throw normalizationError();
  }

  return canonical;
}

function safeTmdbUrlOrNull(value: unknown): string | null {
  const text = textOrNull(value);

  if (text === null) {
    return null;
  }

  try {
    const url = new URL(text);

    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (url.hostname === "www.themoviedb.org" ||
        url.hostname === "themoviedb.org")
      ? text
      : null;
  } catch {
    return null;
  }
}

function normalizeProviderGroup(
  value: unknown,
  configuration: TmdbImageConfiguration,
): TmdbTitleProvider[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw normalizationError();
  }

  const providers: TmdbTitleProvider[] = [];
  const seenIds = new Set<number>();

  for (const candidate of value) {
    const provider = recordOrNull(candidate);
    const id = positiveIntegerOrNull(provider?.provider_id);
    const name = textOrNull(provider?.provider_name);

    if (id === null || name === null || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    providers.push({
      id,
      name,
      logoUrl: buildImageUrl(
        relativeImagePathOrNull(provider?.logo_path),
        configuration,
        "logo",
      ),
    });
  }

  return providers;
}

function normalizeProviderAvailability(
  payload: unknown,
  watchRegion: string | undefined,
  configuration: TmdbImageConfiguration,
  requestedId: number,
): TmdbTitleProviderAvailability | null {
  if (watchRegion === undefined) {
    return null;
  }

  const region = canonicalRegion(watchRegion);
  const envelope = recordOrNull(payload);
  const results = recordOrNull(envelope?.results);

  if (positiveIntegerOrNull(envelope?.id) !== requestedId || results === null) {
    throw normalizationError();
  }

  const availability = recordOrNull(results[region]);

  if (availability === null) {
    return null;
  }

  const streaming = normalizeProviderGroup(
    availability.flatrate,
    configuration,
  );
  const free = normalizeProviderGroup(availability.free, configuration);
  const advertising = normalizeProviderGroup(availability.ads, configuration);
  const rental = normalizeProviderGroup(availability.rent, configuration);
  const purchase = normalizeProviderGroup(availability.buy, configuration);

  if (
    streaming.length === 0 &&
    free.length === 0 &&
    advertising.length === 0 &&
    rental.length === 0 &&
    purchase.length === 0
  ) {
    return null;
  }

  return {
    source: "justwatch",
    watchRegion: region,
    tmdbUrl: safeTmdbUrlOrNull(availability.link),
    streaming,
    free,
    advertising,
    rental,
    purchase,
  };
}

export function normalizeTmdbTitleDetails({
  mediaType,
  id: requestedId,
  watchRegion,
  detailPayload,
  imagePayload,
  videoPayload,
  providerPayload,
  imageConfiguration,
}: TmdbTitleNormalizationInput): TmdbTitleDetails {
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    positiveIntegerOrNull(requestedId) === null
  ) {
    throw normalizationError();
  }

  const details = recordOrNull(detailPayload);

  if (details === null) {
    throw normalizationError();
  }

  const id = positiveIntegerOrNull(details.id);
  const titleKey = mediaType === "movie" ? "title" : "name";
  const originalTitleKey =
    mediaType === "movie" ? "original_title" : "original_name";
  const releaseDateKey =
    mediaType === "movie" ? "release_date" : "first_air_date";
  const title = textOrNull(details[titleKey]);

  if (id === null || id !== requestedId || title === null) {
    throw normalizationError();
  }

  const images = requiredImageCollections(imagePayload, requestedId);
  const posterPath =
    relativeImagePathOrNull(details.poster_path) ??
    firstImagePath(images.posters);
  const backdropPath =
    relativeImagePathOrNull(details.backdrop_path) ??
    firstImagePath(images.backdrops);

  return {
    source: "tmdb",
    mediaType,
    id,
    title,
    originalTitle: textOrNull(details[originalTitleKey]),
    overview: textOrNull(details.overview),
    releaseDate: dateOrNull(details[releaseDateKey]),
    originalLanguage: textOrNull(details.original_language),
    genres: normalizeGenres(details.genres),
    runtime: normalizeRuntime(details, mediaType),
    posterUrl: buildImageUrl(posterPath, imageConfiguration, "poster"),
    backdropUrl: buildImageUrl(backdropPath, imageConfiguration, "backdrop"),
    voteAverage: ratingOrNull(details.vote_average),
    voteCount: nonnegativeIntegerOrNull(details.vote_count),
    adult: booleanOrNull(details.adult),
    trailerUrl: selectOfficialVideo(videoPayload, requestedId),
    providerAvailability: normalizeProviderAvailability(
      providerPayload,
      watchRegion,
      imageConfiguration,
      requestedId,
    ),
  };
}
