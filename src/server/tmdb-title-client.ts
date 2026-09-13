import type { MediaSummary } from "../shared/media-contracts.ts";
import {
  fetchTmdbJson,
  TmdbDiscoveryError,
  type TmdbDiscoveryClientOptions,
} from "./tmdb-discovery-client.ts";
import { defaultTmdbReferenceDataCache } from "./tmdb-reference-cache.ts";
import type { TmdbImageConfiguration } from "./tmdb-reference-normalization.ts";
import {
  normalizeTmdbTitleDetails,
  type TmdbTitleDetails,
} from "./tmdb-title-normalization.ts";
import {
  createTmdbTitleRequestPlans,
  type TmdbTitleRequestOptions,
  type TmdbTitleRequestPlan,
} from "./tmdb-title-requests.ts";

export type TmdbTitleFetchJson = (
  pathname: string,
  searchParameters: Readonly<Record<string, string>>,
  options: TmdbDiscoveryClientOptions,
) => Promise<unknown>;

export interface TmdbImageConfigurationSource {
  getImageConfiguration(): Promise<TmdbImageConfiguration>;
}

export interface TmdbTitleClientOptions
  extends TmdbDiscoveryClientOptions, TmdbTitleRequestOptions {
  readonly fetchJson?: TmdbTitleFetchJson;
  readonly imageConfigurationSource?: TmdbImageConfigurationSource;
}

function configurationError(): TmdbDiscoveryError {
  return new TmdbDiscoveryError("CONFIGURATION_ERROR");
}

function safeClientError(reason: unknown): TmdbDiscoveryError {
  return reason instanceof TmdbDiscoveryError
    ? reason
    : new TmdbDiscoveryError("UPSTREAM_ERROR");
}

async function fetchPlan(
  plan: TmdbTitleRequestPlan,
  fetchJson: TmdbTitleFetchJson,
  clientOptions: TmdbDiscoveryClientOptions,
): Promise<unknown> {
  try {
    return await fetchJson(plan.pathname, plan.searchParameters, clientOptions);
  } catch (error) {
    throw safeClientError(error);
  }
}

async function fetchImageConfiguration(
  source: TmdbImageConfigurationSource,
): Promise<TmdbImageConfiguration> {
  try {
    return await source.getImageConfiguration();
  } catch (error) {
    throw safeClientError(error);
  }
}

function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "fulfilled") {
    return result.value;
  }

  throw safeClientError(result.reason);
}

export async function fetchTmdbTitleDetails(
  mediaType: MediaSummary["mediaType"],
  id: number,
  {
    language,
    watchRegion,
    fetchJson = fetchTmdbJson,
    imageConfigurationSource = defaultTmdbReferenceDataCache,
    token,
    fetchImpl,
    timeoutMs,
  }: TmdbTitleClientOptions = {},
): Promise<TmdbTitleDetails> {
  if (
    typeof fetchJson !== "function" ||
    typeof imageConfigurationSource?.getImageConfiguration !== "function"
  ) {
    throw configurationError();
  }

  const plans = createTmdbTitleRequestPlans(mediaType, id, {
    language,
    watchRegion,
  });
  const clientOptions: TmdbDiscoveryClientOptions = {
    token,
    fetchImpl,
    timeoutMs,
  };
  const detailPayload = await fetchPlan(
    plans.details,
    fetchJson,
    clientOptions,
  );
  const [configurationResult, imageResult, videoResult, providerResult] =
    await Promise.allSettled([
      fetchImageConfiguration(imageConfigurationSource),
      fetchPlan(plans.images, fetchJson, clientOptions),
      fetchPlan(plans.videos, fetchJson, clientOptions),
      plans.watchProviders === null
        ? Promise.resolve<unknown>(undefined)
        : fetchPlan(plans.watchProviders, fetchJson, clientOptions),
    ]);
  const imageConfiguration = settledValue(configurationResult);
  const imagePayload = settledValue(imageResult);
  const videoPayload = settledValue(videoResult);
  const providerPayload = settledValue(providerResult);

  try {
    return normalizeTmdbTitleDetails({
      mediaType: plans.mediaType,
      id: plans.id,
      watchRegion: plans.watchRegion ?? undefined,
      detailPayload,
      imagePayload,
      videoPayload,
      providerPayload,
      imageConfiguration,
    });
  } catch {
    throw new TmdbDiscoveryError("INVALID_RESPONSE");
  }
}
