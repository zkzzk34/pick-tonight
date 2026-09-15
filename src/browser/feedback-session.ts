import type {
  RecommendationCardAction,
  RecommendationCardData,
} from "./recommendation-card-model";

export const FEEDBACK_REASON_OPTIONS = [
  { code: "too-long", label: "Too long" },
  { code: "unavailable", label: "Unavailable" },
  { code: "wrong-mood", label: "Wrong mood" },
  { code: "disliked-genre", label: "Disliked genre" },
  {
    code: "rating-content-concern",
    label: "Rating or content concern",
  },
  { code: "not-interested", label: "Not interested" },
] as const;

export type FeedbackReasonCode =
  (typeof FEEDBACK_REASON_OPTIONS)[number]["code"] | "other";

export type ReplacementFeedbackAction =
  "replace" | "not-tonight" | "not-my-taste" | "already-watched";

export type SessionAction =
  Exclude<RecommendationCardAction, "details"> | "replace";

export type TasteSignalKind = "positive" | "negative" | "weak-save" | "watched";

export interface TasteSignal {
  readonly kind: TasteSignalKind;
  readonly action:
    "save" | "more-like-this" | "not-my-taste" | "already-watched";
  readonly mediaKey: string;
}

export type TasteSignalRecorder = (signal: TasteSignal) => void;

export interface PendingFeedback {
  readonly mediaKey: string;
  readonly title: string;
  readonly action: ReplacementFeedbackAction;
}

export interface SessionFeedbackRecord extends PendingFeedback {
  readonly reason: FeedbackReasonCode;
  readonly freeText: string | null;
}

export interface ReplacementHistoryEntry {
  readonly action: ReplacementFeedbackAction;
  readonly index: number;
  readonly previousMediaKey: string;
  readonly replacementMediaKey: string | null;
}

export interface FeedbackSessionState {
  readonly shownMediaKeys: readonly string[];
  readonly removedMediaKeys: readonly string[];
  readonly sessionActions: readonly {
    readonly action: SessionAction;
    readonly mediaKey: string;
  }[];
  readonly replacementHistory: readonly ReplacementHistoryEntry[];
  readonly feedbackRecords: readonly SessionFeedbackRecord[];
}

function appendUnique(
  values: readonly string[],
  value: string,
): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

export function createFeedbackSessionState(
  initialRecommendations: readonly RecommendationCardData[],
): FeedbackSessionState {
  return {
    shownMediaKeys: [
      ...new Set(
        initialRecommendations.map((recommendation) => recommendation.mediaKey),
      ),
    ],
    removedMediaKeys: [],
    sessionActions: [],
    replacementHistory: [],
    feedbackRecords: [],
  };
}

export function recordSessionAction(
  state: FeedbackSessionState,
  action: SessionAction,
  mediaKey: string,
): FeedbackSessionState {
  return {
    ...state,
    sessionActions: [
      ...state.sessionActions,
      {
        action,
        mediaKey,
      },
    ],
  };
}

export function recordReplacementAttempt(
  state: FeedbackSessionState,
  input: {
    readonly action: ReplacementFeedbackAction;
    readonly index: number;
    readonly previousMediaKey: string;
    readonly replacement: RecommendationCardData | null;
    readonly removeFromSession: boolean;
  },
): FeedbackSessionState {
  const afterAction = recordSessionAction(
    state,
    input.action,
    input.previousMediaKey,
  );

  return {
    ...afterAction,
    shownMediaKeys:
      input.replacement === null
        ? afterAction.shownMediaKeys
        : appendUnique(afterAction.shownMediaKeys, input.replacement.mediaKey),
    removedMediaKeys: input.removeFromSession
      ? appendUnique(afterAction.removedMediaKeys, input.previousMediaKey)
      : afterAction.removedMediaKeys,
    replacementHistory: [
      ...afterAction.replacementHistory,
      {
        action: input.action,
        index: input.index,
        previousMediaKey: input.previousMediaKey,
        replacementMediaKey: input.replacement?.mediaKey ?? null,
      },
    ],
  };
}

export function recordFeedbackReason(
  state: FeedbackSessionState,
  pending: PendingFeedback,
  reason: FeedbackReasonCode,
  freeText: string | null,
): FeedbackSessionState {
  const normalizedText = freeText?.trim() || null;

  return {
    ...state,
    feedbackRecords: [
      ...state.feedbackRecords,
      {
        ...pending,
        reason,
        freeText: normalizedText,
      },
    ],
  };
}

export function selectNextReplacement(
  pool: readonly RecommendationCardData[],
  state: FeedbackSessionState,
  currentRecommendations: readonly RecommendationCardData[],
): RecommendationCardData | null {
  const excluded = new Set([
    ...state.shownMediaKeys,
    ...state.removedMediaKeys,
    ...currentRecommendations.map((recommendation) => recommendation.mediaKey),
  ]);

  return pool.find((candidate) => !excluded.has(candidate.mediaKey)) ?? null;
}
