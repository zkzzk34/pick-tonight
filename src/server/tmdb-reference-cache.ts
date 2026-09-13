import { fetchTmdbJson, TmdbDiscoveryError } from "./tmdb-discovery-client.ts";
import type { TmdbDiscoveryClientOptions } from "./tmdb-discovery-client.ts";
import {
  normalizeTmdbGenres,
  normalizeTmdbImageConfiguration,
  normalizeTmdbWatchProviderRegions,
  normalizeTmdbWatchProviders,
} from "./tmdb-reference-normalization.ts";
import type {
  TmdbGenre,
  TmdbImageConfiguration,
  TmdbWatchProvider,
  TmdbWatchProviderRegion,
} from "./tmdb-reference-normalization.ts";

export const DEFAULT_TMDB_REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const DEFAULT_GENRE_LANGUAGE = "en";
const DEFAULT_PROVIDER_LANGUAGE = "en-US";

export type TmdbReferenceMediaType = "movie" | "tv";

export interface TmdbWatchProviderListOptions {
  readonly language?: string;
  readonly watchRegion?: string;
}

export type TmdbReferenceFetchJson = (
  pathname: string,
  searchParameters: Readonly<Record<string, string>>,
  options: TmdbDiscoveryClientOptions,
) => Promise<unknown>;

export interface TmdbReferenceDataCacheOptions extends TmdbDiscoveryClientOptions {
  readonly fetchJson?: TmdbReferenceFetchJson;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

interface ReferenceRequest<T> {
  readonly key: string;
  readonly pathname: string;
  readonly searchParameters: Readonly<Record<string, string>>;
  readonly normalize: (payload: unknown) => T;
}

function configurationError(): TmdbDiscoveryError {
  return new TmdbDiscoveryError("CONFIGURATION_ERROR");
}

function canonicalLanguage(language: string): string {
  const match = /^([A-Za-z]{2})(?:-([A-Za-z]{2}))?$/.exec(language.trim());

  if (match === null) {
    throw configurationError();
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
    throw configurationError();
  }

  return canonical;
}

function checkedMediaType(
  mediaType: TmdbReferenceMediaType,
): TmdbReferenceMediaType {
  if (mediaType !== "movie" && mediaType !== "tv") {
    throw configurationError();
  }

  return mediaType;
}

export class TmdbReferenceDataCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly fetchJson: TmdbReferenceFetchJson;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly clientOptions: TmdbDiscoveryClientOptions;

  constructor({
    fetchJson = fetchTmdbJson,
    now = Date.now,
    ttlMs = DEFAULT_TMDB_REFERENCE_CACHE_TTL_MS,
    token,
    fetchImpl,
    timeoutMs,
  }: TmdbReferenceDataCacheOptions = {}) {
    if (
      typeof fetchJson !== "function" ||
      typeof now !== "function" ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0
    ) {
      throw configurationError();
    }

    this.fetchJson = fetchJson;
    this.now = now;
    this.ttlMs = ttlMs;
    this.clientOptions = { token, fetchImpl, timeoutMs };
  }

  getImageConfiguration(): Promise<TmdbImageConfiguration> {
    return this.readThrough({
      key: "configuration",
      pathname: "/configuration",
      searchParameters: {},
      normalize: normalizeTmdbImageConfiguration,
    });
  }

  getGenres(
    mediaType: TmdbReferenceMediaType,
    language = DEFAULT_GENRE_LANGUAGE,
  ): Promise<readonly TmdbGenre[]> {
    const checkedType = checkedMediaType(mediaType);
    const checkedLanguage = canonicalLanguage(language);

    return this.readThrough({
      key: `genres:${checkedType}:${checkedLanguage}`,
      pathname: `/genre/${checkedType}/list`,
      searchParameters: { language: checkedLanguage },
      normalize: normalizeTmdbGenres,
    });
  }

  getWatchProviderRegions(
    language = DEFAULT_PROVIDER_LANGUAGE,
  ): Promise<readonly TmdbWatchProviderRegion[]> {
    const checkedLanguage = canonicalLanguage(language);

    return this.readThrough({
      key: `provider-regions:${checkedLanguage}`,
      pathname: "/watch/providers/regions",
      searchParameters: { language: checkedLanguage },
      normalize: normalizeTmdbWatchProviderRegions,
    });
  }

  getWatchProviders(
    mediaType: TmdbReferenceMediaType,
    {
      language = DEFAULT_PROVIDER_LANGUAGE,
      watchRegion,
    }: TmdbWatchProviderListOptions = {},
  ): Promise<readonly TmdbWatchProvider[]> {
    const checkedType = checkedMediaType(mediaType);
    const checkedLanguage = canonicalLanguage(language);
    const checkedRegion =
      watchRegion === undefined ? undefined : canonicalRegion(watchRegion);
    const searchParameters: Record<string, string> = {
      language: checkedLanguage,
    };

    if (checkedRegion !== undefined) {
      searchParameters.watch_region = checkedRegion;
    }

    return this.readThrough({
      key: `providers:${checkedType}:${checkedLanguage}:${checkedRegion ?? "*"}`,
      pathname: `/watch/providers/${checkedType}`,
      searchParameters,
      normalize: normalizeTmdbWatchProviders,
    });
  }

  private readNow(): number {
    let timestamp: number;

    try {
      timestamp = this.now();
    } catch {
      throw configurationError();
    }

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw configurationError();
    }

    return timestamp;
  }

  private async readThrough<T>(request: ReferenceRequest<T>): Promise<T> {
    const requestedAt = this.readNow();
    const cached = this.entries.get(request.key);

    if (cached !== undefined && requestedAt < cached.expiresAt) {
      return cached.value as T;
    }

    if (cached !== undefined) {
      this.entries.delete(request.key);
    }

    const pending = this.inFlight.get(request.key);

    if (pending !== undefined) {
      return pending as Promise<T>;
    }

    const refresh = this.refresh(request);
    this.inFlight.set(request.key, refresh);

    try {
      return await refresh;
    } finally {
      if (this.inFlight.get(request.key) === refresh) {
        this.inFlight.delete(request.key);
      }
    }
  }

  private async refresh<T>(request: ReferenceRequest<T>): Promise<T> {
    let payload: unknown;

    try {
      payload = await this.fetchJson(
        request.pathname,
        request.searchParameters,
        this.clientOptions,
      );
    } catch (error) {
      if (error instanceof TmdbDiscoveryError) {
        throw error;
      }

      throw new TmdbDiscoveryError("UPSTREAM_ERROR");
    }

    let normalized: T;

    try {
      normalized = request.normalize(payload);
    } catch {
      throw new TmdbDiscoveryError("INVALID_RESPONSE");
    }

    this.entries.set(request.key, {
      value: normalized,
      expiresAt: this.readNow() + this.ttlMs,
    });

    return normalized;
  }
}

export const defaultTmdbReferenceDataCache = new TmdbReferenceDataCache();
