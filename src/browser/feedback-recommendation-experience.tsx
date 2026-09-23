import { useCallback, useEffect, useRef, useState } from "react";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import {
  recordFeedbackReason,
  recordReplacementAttempt,
  recordSessionAction,
  selectNextReplacement,
  createFeedbackSessionState,
  type FeedbackReasonCode,
  type FeedbackSessionState,
  type PendingFeedback,
  type ReplacementFeedbackAction,
  type TasteSignalKind,
  type TasteSignalRecorder,
} from "./feedback-session";
import { FeedbackReasonPanel } from "./feedback-reason-panel";
import {
  replaceRecommendationAt,
  type RecommendationCardAction,
  type RecommendationCardData,
  type RecommendationCardSet,
} from "./recommendation-card-model";
import { usesDeterministicBrowserFixtures } from "./browser-data-mode";
import { PREVIEW_REPLACEMENT_POOL } from "./recommendation-card-preview";
import { RecommendationCards } from "./recommendation-cards";
import {
  recommendationFailureMessage,
  requestProductRecommendationBatch,
  requestProductTitleDetail,
} from "./product-api-client";
import { TitleDetail } from "./title-detail";
import type { TitleDetailAction, TitleDetailData } from "./title-detail-model";
import { getPreviewTitleDetail } from "./title-detail-preview";
import type { SaveToWatchlist } from "./local-watchlist";
import {
  createRecommendationItemAnalyticsReference,
  trackFeedbackSubmitted,
  trackRecommendationOpened,
  trackRecommendationItemShown,
  trackRecommendationRejected,
  trackRecommendationSaved,
  trackRecommendationsRefreshed,
  trackTrailerClicked,
  trackWatchIntentConfirmed,
  type RecommendationAnalyticsContext,
  type RecommendationItemAnalyticsReference,
} from "./analytics-tracker";

interface FeedbackRecommendationExperienceProps {
  readonly analyticsContext?: RecommendationAnalyticsContext | null;
  readonly savedMediaKeys?: ReadonlySet<string>;
  readonly onSaveTitle?: SaveToWatchlist;
  readonly recommendations: RecommendationCardSet;
  readonly updateRecommendations: (
    update: (current: RecommendationCardSet) => RecommendationCardSet,
  ) => void;
  readonly onStatusMessage: (message: string) => void;
  readonly onEditRequiredRestrictions: () => void;
  readonly submittedPreferences?: RecommendationRequest;
  readonly personalizationEnabled?: boolean;
  readonly recordTasteSignal?: TasteSignalRecorder;
  readonly replacementPool?: readonly RecommendationCardData[];
}

function fallbackTitleDetail(
  recommendation: RecommendationCardData,
  watchRegion: string,
): TitleDetailData {
  const provider = recommendation.providerAvailability;

  return {
    mediaKey: recommendation.mediaKey,
    title: recommendation.title,
    year: recommendation.year,
    mediaType: recommendation.mediaType,
    overview: recommendation.overview,
    posterUrl: recommendation.posterUrl,
    genres: recommendation.genres,
    runtime: recommendation.runtime,
    rating: recommendation.rating,
    freshness: recommendation.freshness,
    watchRegion: provider?.watchRegion ?? watchRegion,
    providerAvailability:
      provider === null
        ? null
        : {
            source: provider.source,
            watchRegion: provider.watchRegion,
            tmdbUrl: null,
            streaming: provider.providerNames,
            free: [],
            ads: [],
            rent: [],
            buy: [],
          },
    trailerUrl: recommendation.trailerUrl,
    fitExplanation:
      recommendation.fitExplanation === null
        ? null
        : {
            summary: recommendation.fitExplanation.text,
            reasons: recommendation.fitExplanation.reasons ?? [],
          },
  };
}

function replacementMessage(
  action: ReplacementFeedbackAction,
  previousTitle: string,
  replacementTitle: string,
  personalizationEnabled: boolean,
): string {
  if (action === "replace") {
    return `${previousTitle} was replaced with ${replacementTitle}. The other recommendations stayed in place.`;
  }

  if (action === "not-tonight") {
    return `${previousTitle} was removed for this active session and replaced with ${replacementTitle}. No lasting dislike was stored.`;
  }

  if (action === "not-my-taste") {
    return personalizationEnabled
      ? `${previousTitle} was replaced with ${replacementTitle}. A negative taste signal was sent to the enabled personalization seam.`
      : `${previousTitle} was replaced with ${replacementTitle}. Personalization is off, so no lasting taste signal was stored.`;
  }

  return personalizationEnabled
    ? `${previousTitle} was marked already watched for the personalization seam and replaced with ${replacementTitle}. It was not treated as disliked.`
    : `${previousTitle} was replaced with ${replacementTitle}. Already watched was not treated as dislike or stored beyond this session.`;
}

const EMPTY_SAVED_MEDIA_KEYS: ReadonlySet<string> = new Set();

const saveForCurrentVisit: SaveToWatchlist = () => ({
  outcome: "added",
  persistence: "session-only",
});

export function FeedbackRecommendationExperience({
  analyticsContext = null,
  onSaveTitle = saveForCurrentVisit,
  savedMediaKeys = EMPTY_SAVED_MEDIA_KEYS,
  recommendations,
  updateRecommendations,
  onStatusMessage,
  onEditRequiredRestrictions,
  submittedPreferences = { watchRegion: "US" },
  personalizationEnabled = false,
  recordTasteSignal,
  replacementPool = usesDeterministicBrowserFixtures()
    ? PREVIEW_REPLACEMENT_POOL
    : undefined,
}: FeedbackRecommendationExperienceProps) {
  const [session, setSession] = useState<FeedbackSessionState>(() =>
    createFeedbackSessionState(recommendations),
  );
  const [pendingFeedback, setPendingFeedback] =
    useState<PendingFeedback | null>(null);
  const [replacementUnavailableIndexes, setReplacementUnavailableIndexes] =
    useState<readonly number[]>([]);
  const [selectedDetailMediaKey, setSelectedDetailMediaKey] = useState<
    string | null
  >(null);
  const [chosenTonightMediaKey, setChosenTonightMediaKey] = useState<
    string | null
  >(null);
  const [loadedTitleDetail, setLoadedTitleDetail] =
    useState<TitleDetailData | null>(null);

  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const replacementRequestInFlight = useRef(false);
  const titleDetailRequestSequence = useRef(0);
  const restoreDetailFocusRef = useRef(false);
  const analyticsRecommendationSessionId = useRef<string | null>(null);
  const recommendationItems = useRef(
    new Map<string, RecommendationItemAnalyticsReference>(),
  );
  const visibleMediaKeysByPosition = useRef(new Map<number, string>());
  const seenMediaKeys = useRef(new Set<string>());
  const impressionSequence = useRef(0);
  const pendingFeedbackAnalyticsItem =
    useRef<RecommendationItemAnalyticsReference | null>(null);

  const synchronizeAnalyticsJourney = useCallback(() => {
    const recommendationSessionId =
      analyticsContext?.recommendationSessionId ?? null;

    if (analyticsRecommendationSessionId.current === recommendationSessionId) {
      return;
    }

    analyticsRecommendationSessionId.current = recommendationSessionId;
    recommendationItems.current.clear();
    visibleMediaKeysByPosition.current.clear();
    seenMediaKeys.current.clear();
    impressionSequence.current = 0;
    pendingFeedbackAnalyticsItem.current = null;
  }, [analyticsContext]);

  function getAnalyticsItemReference(
    recommendation: RecommendationCardData,
    explicitIndex?: number,
  ): RecommendationItemAnalyticsReference | null {
    synchronizeAnalyticsJourney();

    if (analyticsContext === null) {
      return null;
    }

    const index =
      explicitIndex ??
      recommendations.findIndex(
        ({ mediaKey }) => mediaKey === recommendation.mediaKey,
      );

    if (index < 0) {
      return null;
    }

    const existingItem = recommendationItems.current.get(
      recommendation.mediaKey,
    );

    if (existingItem !== undefined) {
      return {
        ...existingItem,
        position: index + 1,
      };
    }

    const created = createRecommendationItemAnalyticsReference(
      recommendation,
      index + 1,
    );

    if (created !== null) {
      recommendationItems.current.set(recommendation.mediaKey, created);
    }

    return created;
  }

  useEffect(() => {
    synchronizeAnalyticsJourney();

    if (analyticsContext === null) {
      return;
    }

    recommendations.forEach((recommendation, index) => {
      const position = index + 1;

      if (
        visibleMediaKeysByPosition.current.get(position) ===
        recommendation.mediaKey
      ) {
        return;
      }

      const existingItem = recommendationItems.current.get(
        recommendation.mediaKey,
      );
      const analyticsItem =
        existingItem === undefined
          ? createRecommendationItemAnalyticsReference(recommendation, position)
          : { ...existingItem, position };

      if (analyticsItem === null) {
        return;
      }

      recommendationItems.current.set(recommendation.mediaKey, analyticsItem);

      const repeatStatus = seenMediaKeys.current.has(recommendation.mediaKey)
        ? "repeated"
        : "first-shown";
      const nextImpressionSequence = impressionSequence.current + 1;

      trackRecommendationItemShown(
        analyticsContext,
        analyticsItem,
        nextImpressionSequence,
        repeatStatus,
      );

      impressionSequence.current = nextImpressionSequence;
      seenMediaKeys.current.add(recommendation.mediaKey);
      visibleMediaKeysByPosition.current.set(position, recommendation.mediaKey);
    });
  }, [analyticsContext, recommendations, synchronizeAnalyticsJourney]);

  useEffect(() => {
    if (selectedDetailMediaKey === null && restoreDetailFocusRef.current) {
      restoreDetailFocusRef.current = false;
      detailReturnFocusRef.current?.focus();
    }
  }, [selectedDetailMediaKey]);

  const selectedRecommendation =
    selectedDetailMediaKey === null
      ? null
      : (recommendations.find(
          ({ mediaKey }) => mediaKey === selectedDetailMediaKey,
        ) ?? null);

  const selectedWatchRegion =
    submittedPreferences.watchRegion ??
    selectedRecommendation?.providerAvailability?.watchRegion ??
    "US";

  const activeDetail =
    selectedRecommendation === null
      ? null
      : loadedTitleDetail?.mediaKey === selectedRecommendation.mediaKey
        ? loadedTitleDetail
        : usesDeterministicBrowserFixtures()
          ? (getPreviewTitleDetail(selectedRecommendation.mediaKey) ??
            fallbackTitleDetail(selectedRecommendation, selectedWatchRegion))
          : fallbackTitleDetail(selectedRecommendation, selectedWatchRegion);

  function emitTasteSignal(
    kind: TasteSignalKind,
    action: "save" | "more-like-this" | "not-my-taste" | "already-watched",
    recommendation: RecommendationCardData,
  ): void {
    if (!personalizationEnabled || recordTasteSignal === undefined) {
      return;
    }

    recordTasteSignal({
      kind,
      action,
      mediaKey: recommendation.mediaKey,
    });
  }

  function openTitleDetail(recommendation: RecommendationCardData): void {
    const analyticsItem = getAnalyticsItemReference(recommendation);

    if (analyticsContext !== null && analyticsItem !== null) {
      trackRecommendationOpened(analyticsContext, analyticsItem);
    }

    const activeElement = document.activeElement;

    detailReturnFocusRef.current =
      activeElement instanceof HTMLButtonElement ? activeElement : null;

    restoreDetailFocusRef.current = false;
    setLoadedTitleDetail(null);
    setSelectedDetailMediaKey(recommendation.mediaKey);

    if (usesDeterministicBrowserFixtures()) {
      onStatusMessage("");
      return;
    }

    const requestSequence = titleDetailRequestSequence.current + 1;
    titleDetailRequestSequence.current = requestSequence;

    const watchRegion =
      submittedPreferences.watchRegion ??
      recommendation.providerAvailability?.watchRegion ??
      "US";

    onStatusMessage(`Loading current details for ${recommendation.title}…`);

    void requestProductTitleDetail(recommendation, watchRegion).then(
      (result) => {
        if (titleDetailRequestSequence.current !== requestSequence) {
          return;
        }

        if (result.status === "complete") {
          setLoadedTitleDetail(result.detail);
          onStatusMessage("");
          return;
        }

        onStatusMessage(
          `${recommendationFailureMessage(result.failure)} Showing the recommendation information already available for ${recommendation.title}.`,
        );
      },
    );
  }

  function closeTitleDetail(): void {
    titleDetailRequestSequence.current += 1;
    restoreDetailFocusRef.current = true;
    setLoadedTitleDetail(null);
    setSelectedDetailMediaKey(null);
  }

  async function performReplacement(
    action: ReplacementFeedbackAction,
    recommendation: RecommendationCardData,
    index: number,
  ): Promise<void> {
    if (replacementRequestInFlight.current) {
      return;
    }

    const analyticsItem = getAnalyticsItemReference(recommendation, index);

    if (
      analyticsContext !== null &&
      analyticsItem !== null &&
      action !== "replace"
    ) {
      trackRecommendationRejected(analyticsContext, analyticsItem, action);
    }

    pendingFeedbackAnalyticsItem.current = analyticsItem;

    setPendingFeedback({
      action,
      mediaKey: recommendation.mediaKey,
      title: recommendation.title,
    });

    titleDetailRequestSequence.current += 1;
    restoreDetailFocusRef.current = false;
    detailReturnFocusRef.current = null;
    setLoadedTitleDetail(null);
    setSelectedDetailMediaKey(null);

    let replacement: RecommendationCardData | null = null;

    if (replacementPool !== undefined) {
      replacement = selectNextReplacement(
        replacementPool,
        session,
        recommendations,
      );
    } else {
      replacementRequestInFlight.current = true;
      onStatusMessage(`Finding another option for ${recommendation.title}…`);

      try {
        const result = await requestProductRecommendationBatch(
          submittedPreferences,
          1,
          {
            shownMediaKeys: [
              ...new Set([
                ...session.shownMediaKeys,
                ...recommendations.map(({ mediaKey }) => mediaKey),
              ]),
            ],
            removedMediaKeys: session.removedMediaKeys,
          },
        );

        if (result.status === "error") {
          onStatusMessage(
            `${recommendationFailureMessage(result.failure)} ${recommendation.title} was not replaced.`,
          );
          return;
        }

        replacement =
          result.status === "complete"
            ? (result.recommendations[0] ?? null)
            : null;
      } finally {
        replacementRequestInFlight.current = false;
      }
    }

    const removeFromSession = action !== "replace";

    setSession((current) =>
      recordReplacementAttempt(current, {
        action,
        index,
        previousMediaKey: recommendation.mediaKey,
        replacement,
        removeFromSession,
      }),
    );

    if (replacement === null) {
      setReplacementUnavailableIndexes((current) =>
        current.includes(index) ? current : [...current, index],
      );

      const personalizationNote =
        action === "not-my-taste" && !personalizationEnabled
          ? " Personalization is off, so no lasting taste signal was stored."
          : "";

      onStatusMessage(
        `No eligible replacement remains for ${recommendation.title}. PickTonight kept the current required restrictions and did not repeat a previously shown title.${personalizationNote}`,
      );
      return;
    }

    setReplacementUnavailableIndexes((current) =>
      current.filter((candidateIndex) => candidateIndex !== index),
    );

    updateRecommendations((current) =>
      replaceRecommendationAt(current, index, replacement),
    );

    if (
      action === "replace" &&
      analyticsContext !== null &&
      analyticsItem !== null
    ) {
      trackRecommendationsRefreshed(analyticsContext, analyticsItem);
    }

    onStatusMessage(
      replacementMessage(
        action,
        recommendation.title,
        replacement.title,
        personalizationEnabled,
      ),
    );
  }

  function handleAction(
    action: RecommendationCardAction,
    recommendation: RecommendationCardData,
  ): void {
    if (action === "details") {
      openTitleDetail(recommendation);
      return;
    }

    if (action === "choose-tonight") {
      const analyticsItem = getAnalyticsItemReference(recommendation);

      if (analyticsContext !== null && analyticsItem !== null) {
        trackWatchIntentConfirmed(analyticsContext, analyticsItem);
      }

      setChosenTonightMediaKey(recommendation.mediaKey);
      setSession((current) =>
        recordSessionAction(current, action, recommendation.mediaKey),
      );
      onStatusMessage(
        `Watch intent set for ${recommendation.title}. This does not mark the title as watched.`,
      );
      return;
    }

    if (action === "save") {
      const saveResult = onSaveTitle(recommendation);

      if (saveResult.outcome === "already-saved") {
        onStatusMessage(
          saveResult.persistence === "persistent"
            ? `${recommendation.title} is already saved in this browser.`
            : `${recommendation.title} is already saved for this visit only because browser storage is unavailable.`,
        );
        return;
      }

      const analyticsItem = getAnalyticsItemReference(recommendation);

      if (analyticsContext !== null && analyticsItem !== null) {
        trackRecommendationSaved(
          analyticsContext,
          analyticsItem,
          saveResult.persistence,
        );
      }

      setSession((current) =>
        recordSessionAction(current, action, recommendation.mediaKey),
      );
      emitTasteSignal("weak-save", "save", recommendation);
      onStatusMessage(
        saveResult.persistence === "persistent"
          ? `Saved ${recommendation.title} in this browser. It will not synchronize to another browser or device.`
          : `Saved ${recommendation.title} for this visit only because browser storage is unavailable.`,
      );
      return;
    }

    if (action === "more-like-this") {
      setSession((current) =>
        recordSessionAction(current, action, recommendation.mediaKey),
      );
      emitTasteSignal("positive", "more-like-this", recommendation);

      onStatusMessage(
        personalizationEnabled
          ? `More like this noted for ${recommendation.title}. A positive signal was sent to the enabled personalization seam.`
          : `More like this noted for ${recommendation.title} for this decision only. Personalization is off, so no lasting taste signal was stored.`,
      );
      return;
    }

    const index = recommendations.findIndex(
      ({ mediaKey }) => mediaKey === recommendation.mediaKey,
    );

    if (index === -1) {
      onStatusMessage(
        `Could not update ${recommendation.title} because it is no longer in the current recommendation set.`,
      );
      return;
    }

    if (action === "not-my-taste") {
      emitTasteSignal("negative", "not-my-taste", recommendation);
      void performReplacement("not-my-taste", recommendation, index);
      return;
    }

    if (action === "already-watched") {
      emitTasteSignal("watched", "already-watched", recommendation);
      void performReplacement("already-watched", recommendation, index);
      return;
    }

    void performReplacement("not-tonight", recommendation, index);
  }

  function handleTrailerClick(recommendation: RecommendationCardData): void {
    const analyticsItem = getAnalyticsItemReference(recommendation);

    if (analyticsContext !== null && analyticsItem !== null) {
      trackTrailerClicked(analyticsContext, analyticsItem);
    }
  }

  function handleDetailTrailerClick(detail: TitleDetailData): void {
    const recommendation = recommendations.find(
      ({ mediaKey }) => mediaKey === detail.mediaKey,
    );

    if (recommendation !== undefined) {
      handleTrailerClick(recommendation);
    }
  }

  function handleDetailAction(
    action: TitleDetailAction,
    detail: TitleDetailData,
  ): void {
    const recommendation = recommendations.find(
      ({ mediaKey }) => mediaKey === detail.mediaKey,
    );

    if (recommendation === undefined) {
      onStatusMessage(
        `Could not update ${detail.title} because it is no longer in the current recommendation set.`,
      );
      return;
    }

    handleAction(action, recommendation);
  }

  function handleReplace(
    recommendation: RecommendationCardData,
    index: number,
  ): void {
    void performReplacement("replace", recommendation, index);
  }

  function handleFeedbackReason(
    reason: FeedbackReasonCode,
    freeText: string | null,
  ): void {
    if (pendingFeedback === null) {
      return;
    }

    setSession((current) =>
      recordFeedbackReason(current, pendingFeedback, reason, freeText),
    );

    if (
      analyticsContext !== null &&
      pendingFeedbackAnalyticsItem.current !== null
    ) {
      trackFeedbackSubmitted(
        analyticsContext,
        pendingFeedbackAnalyticsItem.current,
        reason,
        pendingFeedback.action,
      );
    }

    pendingFeedbackAnalyticsItem.current = null;

    onStatusMessage(
      `Reason noted for ${pendingFeedback.title}. This feedback stays in the active session only.`,
    );

    setPendingFeedback(null);
  }

  return (
    <div className="feedback-experience">
      <div hidden={activeDetail !== null}>
        <RecommendationCards
          onAction={handleAction}
          onEditRequiredRestrictions={onEditRequiredRestrictions}
          onReplace={handleReplace}
          onTrailerClick={handleTrailerClick}
          recommendations={recommendations}
          savedMediaKeys={savedMediaKeys}
          replacementUnavailableIndexes={replacementUnavailableIndexes}
        />
      </div>

      {activeDetail === null ? null : (
        <TitleDetail
          detail={activeDetail}
          isChosenTonight={chosenTonightMediaKey === activeDetail.mediaKey}
          isSaved={savedMediaKeys.has(activeDetail.mediaKey)}
          onAction={handleDetailAction}
          onBack={closeTitleDetail}
          onTrailerClick={handleDetailTrailerClick}
          onReplace={(detail) => {
            const recommendation = recommendations.find(
              ({ mediaKey }) => mediaKey === detail.mediaKey,
            );

            if (recommendation === undefined) {
              onStatusMessage(
                `Could not replace ${detail.title} because it is no longer in the current recommendation set.`,
              );
              return;
            }

            const index = recommendations.findIndex(
              ({ mediaKey }) => mediaKey === detail.mediaKey,
            );

            handleReplace(recommendation, index);
          }}
        />
      )}

      {pendingFeedback === null ? null : (
        <FeedbackReasonPanel
          key={`${pendingFeedback.mediaKey}:${pendingFeedback.action}`}
          onReason={handleFeedbackReason}
          onSkip={() => {
            pendingFeedbackAnalyticsItem.current = null;
            setPendingFeedback(null);
          }}
          pending={pendingFeedback}
        />
      )}
    </div>
  );
}
