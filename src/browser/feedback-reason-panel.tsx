import { useState } from "react";

import {
  FEEDBACK_REASON_OPTIONS,
  type FeedbackReasonCode,
  type PendingFeedback,
} from "./feedback-session";

interface FeedbackReasonPanelProps {
  readonly pending: PendingFeedback;
  readonly onReason: (
    reason: FeedbackReasonCode,
    freeText: string | null,
  ) => void;
  readonly onSkip: () => void;
}

export function FeedbackReasonPanel({
  pending,
  onReason,
  onSkip,
}: FeedbackReasonPanelProps) {
  const [showOther, setShowOther] = useState(false);
  const [freeText, setFreeText] = useState("");

  return (
    <section
      aria-label={`Optional feedback for ${pending.title}`}
      className="feedback-reason"
    >
      <div className="feedback-reason__heading">
        <div>
          <p className="eyebrow">Optional feedback</p>
          <h3>Want to tell us why?</h3>
          <p>
            This reason stays in the active session. It is not written to
            analytics or persistent storage.
          </p>
        </div>

        <button
          className="feedback-reason__skip"
          onClick={onSkip}
          type="button"
        >
          Skip
        </button>
      </div>

      <div
        aria-label="Structured feedback reasons"
        className="feedback-reason__chips"
        role="group"
      >
        {FEEDBACK_REASON_OPTIONS.map((option) => (
          <button
            key={option.code}
            onClick={() => onReason(option.code, null)}
            type="button"
          >
            {option.label}
          </button>
        ))}

        <button
          aria-expanded={showOther}
          onClick={() => setShowOther((current) => !current)}
          type="button"
        >
          Something else
        </button>
      </div>

      {showOther ? (
        <div className="feedback-reason__other">
          <label htmlFor="feedback-other-reason">
            Something else <span>(optional, 200 characters max)</span>
          </label>
          <textarea
            id="feedback-other-reason"
            maxLength={200}
            onChange={(event) => setFreeText(event.currentTarget.value)}
            rows={3}
            value={freeText}
          />
          <button
            disabled={freeText.trim() === ""}
            onClick={() => onReason("other", freeText)}
            type="button"
          >
            Save reason for this session
          </button>
        </div>
      ) : null}
    </section>
  );
}
