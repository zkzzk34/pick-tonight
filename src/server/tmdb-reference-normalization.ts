export const TMDB_REFERENCE_NORMALIZATION_ERROR_MESSAGE =
  "TMDB returned reference data that PickTonight could not read.";

export class TmdbReferenceNormalizationError extends Error {
  constructor() {
    super(TMDB_REFERENCE_NORMALIZATION_ERROR_MESSAGE);
    this.name = "TmdbReferenceNormalizationError";
  }
}

export interface TmdbImageConfiguration {
  readonly baseUrl: string;
  readonly secureBaseUrl: string;
  readonly backdropSizes: readonly string[];
  readonly logoSizes: readonly string[];
  readonly posterSizes: readonly string[];
  readonly profileSizes: readonly string[];
  readonly stillSizes: readonly string[];
}

export interface TmdbGenre {
  readonly id: number;
  readonly name: string;
}

export interface TmdbWatchProviderRegion {
  readonly code: string;
  readonly englishName: string;
  readonly nativeName: string | null;
}

export interface TmdbWatchProvider {
  readonly id: number;
  readonly name: string;
  readonly logoPath: string | null;
  readonly displayPriority: number | null;
  readonly displayPriorities: Readonly<Record<string, number>>;
}

type UnknownRecord = Record<string, unknown>;

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

function countryCodeOrNull(value: unknown): string | null {
  const code = textOrNull(value)?.toUpperCase();
  return code !== undefined && /^[A-Z]{2}$/.test(code) ? code : null;
}

function relativeImagePathOrNull(value: unknown): string | null {
  const path = textOrNull(value);

  return path !== null && path.startsWith("/") && !path.startsWith("//")
    ? path
    : null;
}

function httpBaseUrlOrNull(value: unknown, secureOnly: boolean): string | null {
  const text = textOrNull(value);

  if (text === null) {
    return null;
  }

  try {
    const parsed = new URL(text);
    const permittedProtocol =
      parsed.protocol === "https:" ||
      (!secureOnly && parsed.protocol === "http:");

    if (
      !permittedProtocol ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }

    return text.endsWith("/") ? text : `${text}/`;
  } catch {
    return null;
  }
}

function textListOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const text = textOrNull(item);

    if (text !== null && !seen.has(text)) {
      seen.add(text);
      values.push(text);
    }
  }

  return values.length > 0 ? values : null;
}

function requiredCollection(
  payload: unknown,
  property: string,
): readonly unknown[] {
  const payloadRecord = recordOrNull(payload);
  const collection = payloadRecord?.[property];

  if (!Array.isArray(collection)) {
    throw new TmdbReferenceNormalizationError();
  }

  return collection;
}

function displayPrioritiesOrEmpty(
  value: unknown,
): Readonly<Record<string, number>> {
  const priorityRecord = recordOrNull(value);

  if (priorityRecord === null) {
    return {};
  }

  const entries: [string, number][] = [];
  const seenCodes = new Set<string>();

  for (const [rawCode, rawPriority] of Object.entries(priorityRecord)) {
    const code = countryCodeOrNull(rawCode);
    const priority = nonnegativeIntegerOrNull(rawPriority);

    if (code !== null && priority !== null && !seenCodes.has(code)) {
      seenCodes.add(code);
      entries.push([code, priority]);
    }
  }

  entries.sort(([firstCode], [secondCode]) =>
    firstCode.localeCompare(secondCode),
  );

  return Object.fromEntries(entries);
}

export function normalizeTmdbImageConfiguration(
  payload: unknown,
): TmdbImageConfiguration {
  const payloadRecord = recordOrNull(payload);
  const images = recordOrNull(payloadRecord?.images);

  if (images === null) {
    throw new TmdbReferenceNormalizationError();
  }

  const baseUrl = httpBaseUrlOrNull(images.base_url, false);
  const secureBaseUrl = httpBaseUrlOrNull(images.secure_base_url, true);
  const backdropSizes = textListOrNull(images.backdrop_sizes);
  const logoSizes = textListOrNull(images.logo_sizes);
  const posterSizes = textListOrNull(images.poster_sizes);
  const profileSizes = textListOrNull(images.profile_sizes);
  const stillSizes = textListOrNull(images.still_sizes);

  if (
    baseUrl === null ||
    secureBaseUrl === null ||
    backdropSizes === null ||
    logoSizes === null ||
    posterSizes === null ||
    profileSizes === null ||
    stillSizes === null
  ) {
    throw new TmdbReferenceNormalizationError();
  }

  return {
    baseUrl,
    secureBaseUrl,
    backdropSizes,
    logoSizes,
    posterSizes,
    profileSizes,
    stillSizes,
  };
}

export function normalizeTmdbGenres(payload: unknown): TmdbGenre[] {
  const genres = requiredCollection(payload, "genres");
  const normalized: TmdbGenre[] = [];
  const seenIds = new Set<number>();

  for (const genreValue of genres) {
    const genre = recordOrNull(genreValue);

    if (genre === null) {
      continue;
    }

    const id = positiveIntegerOrNull(genre.id);
    const name = textOrNull(genre.name);

    if (id === null || name === null || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    normalized.push({ id, name });
  }

  return normalized;
}

export function normalizeTmdbWatchProviderRegions(
  payload: unknown,
): TmdbWatchProviderRegion[] {
  const regions = requiredCollection(payload, "results");
  const normalized: TmdbWatchProviderRegion[] = [];
  const seenCodes = new Set<string>();

  for (const regionValue of regions) {
    const region = recordOrNull(regionValue);

    if (region === null) {
      continue;
    }

    const code = countryCodeOrNull(region.iso_3166_1);
    const englishName = textOrNull(region.english_name);

    if (code === null || englishName === null || seenCodes.has(code)) {
      continue;
    }

    seenCodes.add(code);
    normalized.push({
      code,
      englishName,
      nativeName: textOrNull(region.native_name),
    });
  }

  return normalized;
}

export function normalizeTmdbWatchProviders(
  payload: unknown,
): TmdbWatchProvider[] {
  const providers = requiredCollection(payload, "results");
  const normalized: TmdbWatchProvider[] = [];
  const seenIds = new Set<number>();

  for (const providerValue of providers) {
    const provider = recordOrNull(providerValue);

    if (provider === null) {
      continue;
    }

    const id = positiveIntegerOrNull(provider.provider_id);
    const name = textOrNull(provider.provider_name);

    if (id === null || name === null || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    normalized.push({
      id,
      name,
      logoPath: relativeImagePathOrNull(provider.logo_path),
      displayPriority: nonnegativeIntegerOrNull(provider.display_priority),
      displayPriorities: displayPrioritiesOrEmpty(provider.display_priorities),
    });
  }

  return normalized;
}
