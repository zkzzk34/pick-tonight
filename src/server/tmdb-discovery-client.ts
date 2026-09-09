import {
  readTmdbApiReadToken,
  ServerConfigurationError,
} from "./environment.ts";
import {
  normalizeTmdbMovieResult,
  normalizeTmdbTvResult,
  TmdbNormalizationError,
} from "./tmdb-normalization.ts";
import type { MediaSummary } from "../shared/media-contracts.ts";
import type { TmdbDiscoveryBatch } from "./tmdb-discovery-candidates.ts";
import type { TmdbDiscoveryRequestPlan } from "./tmdb-discovery-requests.ts";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

export const DEFAULT_TMDB_DISCOVERY_TIMEOUT_MS = 5_000;

export const TMDB_DISCOVERY_ERROR_CODES = [
  "CONFIGURATION_ERROR",
  "AUTHENTICATION_ERROR",
  "RATE_LIMIT_ERROR",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_ERROR",
  "INVALID_RESPONSE",
  "NETWORK_ERROR",
] as const;

export type TmdbDiscoveryErrorCode =
  (typeof TMDB_DISCOVERY_ERROR_CODES)[number];

const ERROR_MESSAGES = {
  CONFIGURATION_ERROR: "TMDB access is not configured on the server.",
  AUTHENTICATION_ERROR: "TMDB authentication failed.",
  RATE_LIMIT_ERROR: "TMDB is receiving too many requests. Try again shortly.",
  UPSTREAM_TIMEOUT: "TMDB took too long to respond. Try again.",
  UPSTREAM_ERROR: "TMDB is temporarily unavailable. Try again shortly.",
  INVALID_RESPONSE: "TMDB returned a response that PickTonight could not read.",
  NETWORK_ERROR:
    "PickTonight could not reach TMDB. Check the connection and try again.",
} as const satisfies Record<TmdbDiscoveryErrorCode, string>;

export class TmdbDiscoveryError extends Error {
  readonly code: TmdbDiscoveryErrorCode;
  readonly status: number | undefined;

  constructor(code: TmdbDiscoveryErrorCode, status?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "TmdbDiscoveryError";
    this.code = code;
    this.status = status;
  }
}

export interface TmdbDiscoveryClientOptions {
  readonly token?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

type UnknownRecord = Record<string, unknown>;

function recordOrNull(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function resolveToken(token: string | undefined): string {
  try {
    return token === undefined
      ? readTmdbApiReadToken()
      : readTmdbApiReadToken({ TMDB_API_READ_TOKEN: token });
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      throw new TmdbDiscoveryError("CONFIGURATION_ERROR");
    }

    throw error;
  }
}

function createRequestUrl(plan: TmdbDiscoveryRequestPlan): URL {
  const requestUrl = new URL(`${TMDB_API_BASE_URL}${plan.pathname}`);

  for (const [name, value] of Object.entries(plan.searchParameters)) {
    requestUrl.searchParams.set(name, value);
  }

  return requestUrl;
}

function normalizeCandidate(
  value: unknown,
  mediaType: MediaSummary["mediaType"],
): MediaSummary {
  return mediaType === "movie"
    ? normalizeTmdbMovieResult(value)
    : normalizeTmdbTvResult(value);
}

function normalizeCandidates(
  payload: unknown,
  mediaType: MediaSummary["mediaType"],
): MediaSummary[] {
  const payloadRecord = recordOrNull(payload);

  if (payloadRecord === null || !Array.isArray(payloadRecord.results)) {
    throw new TmdbDiscoveryError("INVALID_RESPONSE");
  }

  const candidates: MediaSummary[] = [];

  for (const result of payloadRecord.results) {
    try {
      candidates.push(normalizeCandidate(result, mediaType));
    } catch (error) {
      if (error instanceof TmdbNormalizationError) {
        continue;
      }

      throw new TmdbDiscoveryError("INVALID_RESPONSE");
    }
  }

  return candidates;
}

function errorForResponse(response: Response): TmdbDiscoveryError | null {
  if (response.status === 401 || response.status === 403) {
    return new TmdbDiscoveryError("AUTHENTICATION_ERROR", response.status);
  }

  if (response.status === 429) {
    return new TmdbDiscoveryError("RATE_LIMIT_ERROR", response.status);
  }

  if (response.status === 504) {
    return new TmdbDiscoveryError("UPSTREAM_TIMEOUT", response.status);
  }

  if (!response.ok) {
    return new TmdbDiscoveryError("UPSTREAM_ERROR", response.status);
  }

  return null;
}

export async function fetchTmdbDiscoveryBatch(
  plan: TmdbDiscoveryRequestPlan,
  {
    token: suppliedToken,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TMDB_DISCOVERY_TIMEOUT_MS,
  }: TmdbDiscoveryClientOptions = {},
): Promise<TmdbDiscoveryBatch> {
  const token = resolveToken(suppliedToken);

  if (
    typeof fetchImpl !== "function" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new TmdbDiscoveryError("CONFIGURATION_ERROR");
  }

  const requestUrl = createRequestUrl(plan);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetchImpl(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new TmdbDiscoveryError("UPSTREAM_TIMEOUT");
      }

      throw new TmdbDiscoveryError("NETWORK_ERROR");
    }

    if (controller.signal.aborted) {
      throw new TmdbDiscoveryError("UPSTREAM_TIMEOUT");
    }

    const responseError = errorForResponse(response);

    if (responseError !== null) {
      throw responseError;
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new TmdbDiscoveryError("UPSTREAM_TIMEOUT");
      }

      throw new TmdbDiscoveryError("INVALID_RESPONSE", response.status);
    }

    return {
      source: plan.source,
      mediaType: plan.mediaType,
      candidates: normalizeCandidates(payload, plan.mediaType),
      appliedMaximumRuntimeRestriction: plan.appliedMaximumRuntimeRestriction,
      appliedProviderRestriction: plan.appliedProviderRestriction,
    };
  } finally {
    clearTimeout(timeout);
  }
}
