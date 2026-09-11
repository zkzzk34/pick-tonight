import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import type { RecommendationCardSet } from "./recommendation-card-model";
import {
  recommendationFailureCopy,
  snapshotRecommendationRequest,
  type RecommendationRequester,
  type RecommendationRequestViewState,
} from "./recommendation-request-state";

export interface RecommendationRequestPanelProps {
  readonly initialRecommendations?: RecommendationCardSet;
  readonly submittedPreferences: RecommendationRequest;
  readonly requestRecommendations: RecommendationRequester;
  readonly children: (
    recommendations: RecommendationCardSet,
    updateRecommendations: (
      update: (current: RecommendationCardSet) => RecommendationCardSet,
    ) => void,
  ) => ReactNode;
}

const IDLE_STATE = { status: "idle" } as const;
const LOADING_STATE = { status: "loading" } as const;
const UNKNOWN_FAILURE_STATE = {
  status: "error",
  failure: "upstream",
} as const;

export function RecommendationRequestPanel({
  initialRecommendations,
  submittedPreferences,
  requestRecommendations,
  children,
}: RecommendationRequestPanelProps) {
  const [viewState, setViewState] = useState<RecommendationRequestViewState>(
    () =>
      initialRecommendations === undefined
        ? IDLE_STATE
        : {
            status: "complete",
            recommendations: initialRecommendations,
          },
  );
  const requestInFlight = useRef(false);
  const lastSubmittedPreferences = useRef<RecommendationRequest | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  async function runRequest(preferences: RecommendationRequest): Promise<void> {
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setViewState(LOADING_STATE);

    try {
      const result = await requestRecommendations(
        snapshotRecommendationRequest(preferences),
      );

      if (mounted.current) {
        setViewState(result);
      }
    } catch {
      if (mounted.current) {
        setViewState(UNKNOWN_FAILURE_STATE);
      }
    } finally {
      requestInFlight.current = false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (requestInFlight.current) {
      return;
    }

    const snapshot = snapshotRecommendationRequest(submittedPreferences);
    lastSubmittedPreferences.current = snapshot;
    void runRequest(snapshot);
  }

  function handleRetry(): void {
    if (requestInFlight.current || lastSubmittedPreferences.current === null) {
      return;
    }

    void runRequest(lastSubmittedPreferences.current);
  }

  function updateRecommendations(
    update: (current: RecommendationCardSet) => RecommendationCardSet,
  ): void {
    setViewState((current) =>
      current.status === "complete"
        ? {
            status: "complete",
            recommendations: update(current.recommendations),
          }
        : current,
    );
  }

  const isLoading = viewState.status === "loading";
  const failureCopy =
    viewState.status === "error"
      ? recommendationFailureCopy(viewState.failure)
      : null;

  return (
    <section
      aria-label="Recommendation request"
      className="recommendation-request"
    >
      <form
        aria-label="Recommendation request controls"
        className="recommendation-request__controls"
        onSubmit={handleSubmit}
      >
        <button
          className="recommendation-request__submit"
          disabled={isLoading}
          type="submit"
        >
          {isLoading
            ? "Requesting recommendations…"
            : "Request recommendations"}
        </button>
      </form>

      <div
        aria-atomic="true"
        aria-label="Recommendation request status"
        className="recommendation-request__status"
        role="status"
      >
        {viewState.status === "idle" ? (
          <p>
            Submit your preferences when you are ready for three focused picks.
          </p>
        ) : null}

        {viewState.status === "loading" ? (
          <div className="recommendation-request__state recommendation-request__state--loading">
            <h3>Finding your picks</h3>
            <p>
              Keep this page open while PickTonight checks the submitted
              preferences.
            </p>
          </div>
        ) : null}

        {viewState.status === "empty" ? (
          <div className="recommendation-request__state">
            <h3>No eligible recommendations</h3>
            <p>
              No titles matched all of the submitted restrictions. Adjust a
              preference and request again.
            </p>
          </div>
        ) : null}
      </div>

      <div
        aria-atomic="true"
        aria-label="Recommendation request error"
        className="recommendation-request__alert"
        role="alert"
      >
        {failureCopy === null ? null : (
          <div className="recommendation-request__state recommendation-request__state--error">
            <h3>{failureCopy.title}</h3>
            <p>{failureCopy.message}</p>
            <button
              className="recommendation-request__retry"
              disabled={isLoading}
              onClick={handleRetry}
              type="button"
            >
              Retry same preferences
            </button>
          </div>
        )}
      </div>

      <div
        aria-busy={isLoading}
        aria-label="Recommendation results"
        className="recommendation-request__results"
        role="group"
      >
        {viewState.status === "complete"
          ? children(viewState.recommendations, updateRecommendations)
          : null}
      </div>
    </section>
  );
}
