import type { RecommendationRequest } from "../shared/recommendation-contracts.ts";
import {
  createTmdbDiscoveryCandidatePool,
  type TmdbDiscoveryBatch,
  type TmdbDiscoveryCandidate,
  type TmdbDiscoverySource,
} from "./tmdb-discovery-candidates.ts";
import {
  fetchTmdbDiscoveryBatch,
  TmdbDiscoveryError,
  type TmdbDiscoveryClientOptions,
  type TmdbDiscoveryErrorCode,
} from "./tmdb-discovery-client.ts";
import {
  createTmdbDiscoveryRequestPlans,
  type TmdbDiscoveryRequestPlan,
} from "./tmdb-discovery-requests.ts";

export interface TmdbDiscoveryFailure {
  readonly source: TmdbDiscoverySource;
  readonly code: TmdbDiscoveryErrorCode;
}

export interface TmdbDiscoveryResult {
  readonly candidates: readonly TmdbDiscoveryCandidate[];
  readonly failures: readonly TmdbDiscoveryFailure[];
}

type FetchTmdbDiscoveryBatch = (
  plan: TmdbDiscoveryRequestPlan,
  options?: TmdbDiscoveryClientOptions,
) => Promise<TmdbDiscoveryBatch>;

export interface TmdbDiscoveryOptions extends TmdbDiscoveryClientOptions {
  readonly fetchBatch?: FetchTmdbDiscoveryBatch;
}

function safeDiscoveryError(reason: unknown): TmdbDiscoveryError {
  return reason instanceof TmdbDiscoveryError
    ? reason
    : new TmdbDiscoveryError("UPSTREAM_ERROR");
}

export async function discoverTmdbCandidates(
  request: RecommendationRequest,
  {
    fetchBatch = fetchTmdbDiscoveryBatch,
    token,
    fetchImpl,
    timeoutMs,
  }: TmdbDiscoveryOptions = {},
): Promise<TmdbDiscoveryResult> {
  const plans = createTmdbDiscoveryRequestPlans(request);
  const clientOptions: TmdbDiscoveryClientOptions = {
    token,
    fetchImpl,
    timeoutMs,
  };
  const settledBatches = await Promise.allSettled(
    plans.map((plan) => fetchBatch(plan, clientOptions)),
  );
  const batches: TmdbDiscoveryBatch[] = [];
  const failures: TmdbDiscoveryFailure[] = [];
  const failureErrors: TmdbDiscoveryError[] = [];

  for (const [index, settledBatch] of settledBatches.entries()) {
    if (settledBatch.status === "fulfilled") {
      batches.push(settledBatch.value);
      continue;
    }

    const error = safeDiscoveryError(settledBatch.reason);
    const plan = plans[index];

    if (plan === undefined) {
      throw new TmdbDiscoveryError("UPSTREAM_ERROR");
    }

    failures.push({ source: plan.source, code: error.code });
    failureErrors.push(error);
  }

  if (batches.length === 0) {
    throw failureErrors[0] ?? new TmdbDiscoveryError("UPSTREAM_ERROR");
  }

  return {
    candidates: createTmdbDiscoveryCandidatePool(batches, request),
    failures,
  };
}
