import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  replaceRecommendationAt,
  type RecommendationCardData,
  type RecommendationCardSet,
} from "./recommendation-card-model";
import { RecommendationCards } from "./recommendation-cards";

function recommendation(
  overrides: Partial<RecommendationCardData> = {},
): RecommendationCardData {
  return {
    mediaKey: "movie:1",
    title: "Title A",
    year: 2026,
    mediaType: "movie",
    overview: "A concise supported overview.",
    posterUrl: "https://images.example.com/title-a.jpg",
    genres: ["Comedy", "Romance"],
    runtime: { kind: "movie", minutes: 104 },
    rating: { average: 7.8, voteCount: 1240, confidence: "high" },
    freshness: { label: "Released this year", basis: "release-date" },
    providerAvailability: {
      source: "justwatch",
      watchRegion: "US",
      providerNames: ["Example Stream"],
    },
    trailerUrl: "https://video.example.com/title-a",
    fitExplanation: {
      source: "structured-recommendation-evidence",
      text: "Matches your selected comedy and romance preferences.",
    },
    ...overrides,
  };
}

const initialRecommendations = [
  recommendation(),
  recommendation({
    mediaKey: "movie:2",
    title: "Title B",
    year: null,
    overview: " ",
    posterUrl: "http://images.example.com/title-b.jpg",
    genres: [" "],
    runtime: null,
    rating: null,
    freshness: null,
    providerAvailability: {
      source: "justwatch",
      watchRegion: " ",
      providerNames: ["Example Stream"],
    },
    trailerUrl: "javascript:alert(1)",
    fitExplanation: null,
  }),
  recommendation({
    mediaKey: "tv:3",
    title: "Title C",
    mediaType: "tv",
    runtime: { kind: "episode", minutes: 48 },
    rating: { average: 9.9, voteCount: 0, confidence: "none" },
  }),
] as const satisfies RecommendationCardSet;

function renderRecommendations(onAction = vi.fn(), onReplace = vi.fn()) {
  render(
    <RecommendationCards
      onAction={onAction}
      onReplace={onReplace}
      recommendations={initialRecommendations}
    />,
  );

  return { onAction, onReplace };
}

describe("RecommendationCards", () => {
  it("renders three ordered cards with supported evidence and honest fallbacks", () => {
    renderRecommendations();

    const results = screen.getByRole("region", {
      name: "3 picks for tonight",
    });
    const cards = within(results).getAllByRole("article");

    expect(cards).toHaveLength(3);
    expect(
      cards.map(
        (card) => within(card).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["Title A", "Title B", "Title C"]);

    const titleA = screen.getByRole("article", { name: "Title A" });
    expect(
      within(titleA).getByRole("img", { name: "Poster for Title A" }),
    ).toBeInTheDocument();
    expect(within(titleA).getByText("2026")).toBeInTheDocument();
    expect(within(titleA).getByText("Movie")).toBeInTheDocument();
    expect(
      within(titleA).getByText("A concise supported overview."),
    ).toBeInTheDocument();

    const genres = within(titleA).getByRole("list", {
      name: "Genres for Title A",
    });
    expect(genres).toHaveTextContent("Comedy");
    expect(genres).toHaveTextContent("Romance");
    expect(within(titleA).getByText("1h 44m")).toBeInTheDocument();
    expect(
      within(titleA).getByText("7.8/10 · 1,240 votes"),
    ).toBeInTheDocument();
    expect(
      within(titleA).getByText("High-volume rating evidence"),
    ).toBeInTheDocument();
    expect(within(titleA).getByText("Released this year")).toBeInTheDocument();
    expect(within(titleA).getByText("Example Stream · US")).toBeInTheDocument();
    const justWatchLink = within(titleA).getByRole("link", {
      name: "JustWatch",
    });
    expect(justWatchLink).toHaveAttribute("href", "https://www.justwatch.com/");
    expect(justWatchLink.parentElement).toHaveTextContent(
      "Availability data: JustWatch",
    );
    expect(
      within(titleA).getByRole("link", {
        name: "Watch trailer for Title A",
      }),
    ).toHaveAttribute("href", "https://video.example.com/title-a");
    expect(
      within(titleA).getByText(
        "Matches your selected comedy and romance preferences.",
      ),
    ).toBeInTheDocument();

    const titleB = screen.getByRole("article", { name: "Title B" });
    expect(
      within(titleB).getByRole("img", {
        name: "Poster unavailable for Title B",
      }),
    ).toBeInTheDocument();

    for (const fallback of [
      "Year unavailable",
      "Overview unavailable.",
      "Genre information unavailable.",
      "Runtime unavailable.",
      "Rating unavailable.",
      "Freshness information unavailable.",
      "Provider availability unavailable.",
      "Trailer unavailable.",
      "Fit explanation unavailable.",
    ]) {
      expect(within(titleB).getByText(fallback)).toBeInTheDocument();
    }

    const titleC = screen.getByRole("article", { name: "Title C" });
    expect(within(titleC).getByText("Television")).toBeInTheDocument();
    expect(within(titleC).getByText("48m per episode")).toBeInTheDocument();
    expect(
      within(titleC).getByText("Rating not established."),
    ).toBeInTheDocument();
    expect(
      within(titleC).getByText("No meaningful rating sample yet"),
    ).toBeInTheDocument();
    expect(within(titleC).queryByText(/9\.9\/10/)).not.toBeInTheDocument();
  });

  it("uses the accessible poster placeholder after an image error", () => {
    renderRecommendations();

    const titleA = screen.getByRole("article", { name: "Title A" });
    fireEvent.error(
      within(titleA).getByRole("img", { name: "Poster for Title A" }),
    );

    expect(
      within(titleA).getByRole("img", {
        name: "Poster unavailable for Title A",
      }),
    ).toBeInTheDocument();
  });

  it("exposes distinct actions and an accurate disclosure state", () => {
    const { onAction, onReplace } = renderRecommendations();
    const titleA = screen.getByRole("article", { name: "Title A" });

    for (const name of [
      "Choose tonight: Title A",
      "Details: Title A",
      "Save: Title A",
    ]) {
      fireEvent.click(within(titleA).getByRole("button", { name }));
    }
    fireEvent.click(
      within(titleA).getByRole("button", { name: "Replace: Title A" }),
    );

    const disclosure = within(titleA).getByRole("button", {
      name: "More actions: Title A",
      expanded: false,
    });
    const controlledId = disclosure.getAttribute("aria-controls");
    fireEvent.click(disclosure);

    expect(
      within(titleA).getByRole("button", {
        name: "Hide more actions: Title A",
        expanded: true,
      }),
    ).toBeInTheDocument();
    expect(controlledId).not.toBeNull();
    expect(document.getElementById(controlledId ?? "")).toBeInTheDocument();

    for (const name of [
      "More like this: Title A",
      "Not tonight: Title A",
      "Not my taste: Title A",
      "Already watched: Title A",
    ]) {
      fireEvent.click(within(titleA).getByRole("button", { name }));
    }

    expect(onReplace).toHaveBeenCalledWith(initialRecommendations[0], 0);
    expect(onAction.mock.calls.map(([action]) => action)).toEqual([
      "choose-tonight",
      "details",
      "save",
      "more-like-this",
      "not-tonight",
      "not-my-taste",
      "already-watched",
    ]);
  });

  it("replaces one controlled card without resetting its siblings", () => {
    const replacement = recommendation({
      mediaKey: "movie:4",
      title: "Title D",
    });

    function ReplacementHarness() {
      const [recommendations, setRecommendations] =
        useState<RecommendationCardSet>(initialRecommendations);

      return (
        <RecommendationCards
          onAction={() => undefined}
          onReplace={(_, index) =>
            setRecommendations((current) =>
              replaceRecommendationAt(current, index, replacement),
            )
          }
          recommendations={recommendations}
        />
      );
    }

    render(<ReplacementHarness />);
    const titleA = screen.getByRole("article", { name: "Title A" });
    const titleC = screen.getByRole("article", { name: "Title C" });

    fireEvent.click(
      within(screen.getByRole("article", { name: "Title B" })).getByRole(
        "button",
        { name: "Replace: Title B" },
      ),
    );

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(["Title A", "Title D", "Title C"]);
    expect(screen.getByRole("article", { name: "Title D" })).toHaveFocus();
    expect(screen.getByRole("article", { name: "Title A" })).toBe(titleA);
    expect(screen.getByRole("article", { name: "Title C" })).toBe(titleC);
  });
});
