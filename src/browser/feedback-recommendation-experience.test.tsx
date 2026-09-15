import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { FeedbackRecommendationExperience } from "./feedback-recommendation-experience";
import type { TasteSignal } from "./feedback-session";
import {
  INITIAL_PREVIEW_RECOMMENDATIONS,
  PREVIEW_REPLACEMENT_POOL,
} from "./recommendation-card-preview";
import type {
  RecommendationCardData,
  RecommendationCardSet,
} from "./recommendation-card-model";

interface HarnessProps {
  readonly replacementPool?: readonly RecommendationCardData[];
  readonly personalizationEnabled?: boolean;
  readonly recordTasteSignal?: (signal: TasteSignal) => void;
  readonly onEditRequiredRestrictions?: () => void;
  readonly onStatusMessage?: (message: string) => void;
}

function Harness({
  replacementPool = PREVIEW_REPLACEMENT_POOL,
  personalizationEnabled = false,
  recordTasteSignal = () => undefined,
  onEditRequiredRestrictions = () => undefined,
  onStatusMessage = () => undefined,
}: HarnessProps) {
  const [recommendations, setRecommendations] = useState<RecommendationCardSet>(
    INITIAL_PREVIEW_RECOMMENDATIONS,
  );

  return (
    <FeedbackRecommendationExperience
      onEditRequiredRestrictions={onEditRequiredRestrictions}
      onStatusMessage={onStatusMessage}
      personalizationEnabled={personalizationEnabled}
      recommendations={recommendations}
      recordTasteSignal={recordTasteSignal}
      replacementPool={replacementPool}
      updateRecommendations={(update) =>
        setRecommendations((current) => update(current))
      }
    />
  );
}

function titles(): string[] {
  return screen.getAllByRole("article").map(
    (article) =>
      within(article).getByRole("heading", {
        level: 3,
      }).textContent ?? "",
  );
}

describe("FeedbackRecommendationExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("replaces exactly one card while keeping the other recommendations stable", () => {
    render(<Harness />);

    expect(titles()).toEqual([
      "Preview movie A",
      "Preview television B",
      "Preview movie C",
    ]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Preview television B",
      }),
    );

    expect(titles()).toEqual([
      "Preview movie A",
      "Preview movie D",
      "Preview movie C",
    ]);

    expect(
      screen.getByRole("region", {
        name: "Optional feedback for Preview television B",
      }),
    ).toBeInTheDocument();
  });

  it("offers structured feedback after replacement without blocking the replacement", () => {
    const status = vi.fn((message: string) => void message);

    render(<Harness onStatusMessage={status} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Preview movie A",
      }),
    );

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Preview movie D",
      }),
    ).toBeInTheDocument();

    const feedback = screen.getByRole("region", {
      name: "Optional feedback for Preview movie A",
    });

    fireEvent.click(
      within(feedback).getByRole("button", {
        name: "Wrong mood",
      }),
    );

    expect(
      screen.queryByRole("region", {
        name: "Optional feedback for Preview movie A",
      }),
    ).not.toBeInTheDocument();

    expect(status).toHaveBeenLastCalledWith(
      "Reason noted for Preview movie A. This feedback stays in the active session only.",
    );
  });

  it("keeps free-form feedback outside persistent browser storage", () => {
    render(<Harness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Preview movie A",
      }),
    );

    const feedback = screen.getByRole("region", {
      name: "Optional feedback for Preview movie A",
    });

    fireEvent.click(
      within(feedback).getByRole("button", {
        name: "Something else",
      }),
    );

    fireEvent.change(within(feedback).getByLabelText(/Something else/i), {
      target: {
        value: "Not right for tonight.",
      },
    });

    fireEvent.click(
      within(feedback).getByRole("button", {
        name: "Save reason for this session",
      }),
    );

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("works with personalization disabled and emits no lasting taste signals", () => {
    const recorder = vi.fn((signal: TasteSignal) => void signal);
    const status = vi.fn((message: string) => void message);

    render(
      <Harness
        onStatusMessage={status}
        personalizationEnabled={false}
        recordTasteSignal={recorder}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More like this: Preview movie A",
      }),
    );

    expect(recorder).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(
      "More like this noted for Preview movie A for this decision only. Personalization is off, so no lasting taste signal was stored.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Not my taste: Preview movie A",
      }),
    );

    expect(recorder).not.toHaveBeenCalled();

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Preview movie D",
      }),
    ).toBeInTheDocument();
  });

  it("uses distinct personalization seams when personalization is enabled", () => {
    const recorder = vi.fn((signal: TasteSignal) => void signal);

    render(<Harness personalizationEnabled recordTasteSignal={recorder} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More like this: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Not my taste: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Preview television B",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Already watched: Preview television B",
      }),
    );

    expect(recorder.mock.calls.map(([signal]) => signal.kind)).toEqual([
      "weak-save",
      "positive",
      "negative",
      "watched",
    ]);

    expect(recorder.mock.calls.map(([signal]) => signal.action)).toEqual([
      "save",
      "more-like-this",
      "not-my-taste",
      "already-watched",
    ]);
  });

  it("shows an honest insufficient-result slot when no replacement exists", () => {
    const editRestrictions = vi.fn(() => undefined);

    render(
      <Harness
        onEditRequiredRestrictions={editRestrictions}
        replacementPool={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Preview movie A",
      }),
    );

    expect(
      screen.getByRole("status", {
        name: "No eligible replacement for pick 1",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        level: 3,
        name: "Preview movie A",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Preview television B",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Preview movie C",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit required restrictions",
      }),
    );

    expect(editRestrictions).toHaveBeenCalledTimes(1);
  });

  it("does not treat Not tonight or Already watched as dislike", () => {
    const recorder = vi.fn((signal: TasteSignal) => void signal);

    render(<Harness personalizationEnabled recordTasteSignal={recorder} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Preview movie A",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Not tonight: Preview movie A",
      }),
    );

    expect(recorder).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions: Preview television B",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Already watched: Preview television B",
      }),
    );

    expect(recorder).toHaveBeenCalledWith({
      kind: "watched",
      action: "already-watched",
      mediaKey: "preview:tv-b",
    });

    expect(
      recorder.mock.calls.some(([signal]) => signal.kind === "negative"),
    ).toBe(false);
  });
});
