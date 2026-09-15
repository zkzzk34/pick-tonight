import { describe, expect, it } from "vitest";

import {
  createFeedbackSessionState,
  recordFeedbackReason,
  recordReplacementAttempt,
  selectNextReplacement,
  type PendingFeedback,
} from "./feedback-session";
import {
  INITIAL_PREVIEW_RECOMMENDATIONS,
  PREVIEW_REPLACEMENT_POOL,
} from "./recommendation-card-preview";

describe("feedback session model", () => {
  it("never returns a title already shown during the active session", () => {
    let state = createFeedbackSessionState(INITIAL_PREVIEW_RECOMMENDATIONS);

    const first = selectNextReplacement(
      PREVIEW_REPLACEMENT_POOL,
      state,
      INITIAL_PREVIEW_RECOMMENDATIONS,
    );

    expect(first?.title).toBe("Preview movie D");

    state = recordReplacementAttempt(state, {
      action: "replace",
      index: 0,
      previousMediaKey: INITIAL_PREVIEW_RECOMMENDATIONS[0].mediaKey,
      replacement: first,
      removeFromSession: false,
    });

    const second = selectNextReplacement(
      PREVIEW_REPLACEMENT_POOL,
      state,
      INITIAL_PREVIEW_RECOMMENDATIONS,
    );

    expect(second?.title).toBe("Preview television E");

    state = recordReplacementAttempt(state, {
      action: "not-tonight",
      index: 0,
      previousMediaKey: first?.mediaKey ?? "",
      replacement: second,
      removeFromSession: true,
    });

    const third = selectNextReplacement(
      PREVIEW_REPLACEMENT_POOL,
      state,
      INITIAL_PREVIEW_RECOMMENDATIONS,
    );

    expect(third?.title).toBe("Preview movie F");
  });

  it("returns null when the deterministic replacement pool is exhausted", () => {
    let state = createFeedbackSessionState(INITIAL_PREVIEW_RECOMMENDATIONS);

    for (let index = 0; index < PREVIEW_REPLACEMENT_POOL.length; index += 1) {
      const replacement = selectNextReplacement(
        PREVIEW_REPLACEMENT_POOL,
        state,
        INITIAL_PREVIEW_RECOMMENDATIONS,
      );

      expect(replacement).not.toBeNull();

      state = recordReplacementAttempt(state, {
        action: "replace",
        index: 0,
        previousMediaKey: `previous:${index}`,
        replacement,
        removeFromSession: false,
      });
    }

    expect(
      selectNextReplacement(
        PREVIEW_REPLACEMENT_POOL,
        state,
        INITIAL_PREVIEW_RECOMMENDATIONS,
      ),
    ).toBeNull();
  });

  it("keeps structured and free-form feedback in explicit session records", () => {
    const pending: PendingFeedback = {
      mediaKey: "preview:movie-a",
      title: "Preview movie A",
      action: "not-my-taste",
    };

    const state = recordFeedbackReason(
      createFeedbackSessionState(INITIAL_PREVIEW_RECOMMENDATIONS),
      pending,
      "other",
      "  Not for tonight's group.  ",
    );

    expect(state.feedbackRecords).toEqual([
      {
        ...pending,
        reason: "other",
        freeText: "Not for tonight's group.",
      },
    ]);
  });
});
