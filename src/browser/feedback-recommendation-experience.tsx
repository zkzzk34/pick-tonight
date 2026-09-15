import { useEffect, useRef, useState } from "react";

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
import { PREVIEW_REPLACEMENT_POOL } from "./recommendation-card-preview";
import { RecommendationCards } from "./recommendation-cards";
import { TitleDetail } from "./title-detail";
import type { TitleDetailAction, TitleDetailData } from "./title-detail-model";
import { getPreviewTitleDetail } from "./title-detail-preview";
import type { SaveToWatchlist } from "./local-watchlist";

interface FeedbackRecommendationExperienceProps {
  readonly savedMediaKeys?: ReadonlySet<string>;
  readonly onSaveTitle?: SaveToWatchlist;
  readonly recommendations: RecommendationCardSet;
  readonly updateRecommendations: (
    update: (current: RecommendationCardSet) => RecommendationCardSet,
  ) => void;
  readonly onStatusMessage: (message: string) => void;
  readonly onEditRequiredRestrictions: () => void;
  readonly personalizationEnabled?: boolean;
  readonly recordTasteSignal?: TasteSignalRecorder;
  readonly replacementPool?: readonly RecommendationCardData[];
}

function fallbackTitleDetail(
  recommendation: RecommendationCardData,
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
    watchRegion: provider?.watchRegion ?? "US",
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
            reasons: [],
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
  onSaveTitle = saveForCurrentVisit,
  savedMediaKeys = EMPTY_SAVED_MEDIA_KEYS,
  recommendations,
  updateRecommendations,
  onStatusMessage,
  onEditRequiredRestrictions,
  personalizationEnabled = false,
  recordTasteSignal,
  replacementPool = PREVIEW_REPLACEMENT_POOL,
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

  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const restoreDetailFocusRef = useRef(false);

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

  const activeDetail =
    selectedRecommendation === null
      ? null
      : (getPreviewTitleDetail(selectedRecommendation.mediaKey) ??
        fallbackTitleDetail(selectedRecommendation));

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
    const activeElement = document.activeElement;

    detailReturnFocusRef.current =
      activeElement instanceof HTMLButtonElement ? activeElement : null;

    restoreDetailFocusRef.current = false;
    setSelectedDetailMediaKey(recommendation.mediaKey);
    onStatusMessage("");
  }

  function closeTitleDetail(): void {
    restoreDetailFocusRef.current = true;
    setSelectedDetailMediaKey(null);
  }

  function performReplacement(
    action: ReplacementFeedbackAction,
    recommendation: RecommendationCardData,
    index: number,
  ): void {
    const replacement = selectNextReplacement(
      replacementPool,
      session,
      recommendations,
    );

    const removeFromSession = action !== "replace";

    setSession(
      recordReplacementAttempt(session, {
        action,
        index,
        previousMediaKey: recommendation.mediaKey,
        replacement,
        removeFromSession,
      }),
    );

    setPendingFeedback({
      action,
      mediaKey: recommendation.mediaKey,
      title: recommendation.title,
    });

    restoreDetailFocusRef.current = false;
    detailReturnFocusRef.current = null;
    setSelectedDetailMediaKey(null);

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
      performReplacement("not-my-taste", recommendation, index);
      return;
    }

    if (action === "already-watched") {
      emitTasteSignal("watched", "already-watched", recommendation);
      performReplacement("already-watched", recommendation, index);
      return;
    }

    performReplacement("not-tonight", recommendation, index);
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
    performReplacement("replace", recommendation, index);
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
          onSkip={() => setPendingFeedback(null)}
          pending={pendingFeedback}
        />
      )}
    </div>
  );
}
