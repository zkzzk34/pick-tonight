import { describe, expect, it } from "vitest";

import {
  formatRuntime,
  isRecommendationCardSet,
  ratingConfidenceLabels,
  replaceRecommendationAt,
  safeHttpsUrl,
  type RecommendationCardData,
  type RecommendationCardSet,
} from "./recommendation-card-model";

function recommendation(mediaKey: string): RecommendationCardData {
  return {
    mediaKey,
    title: mediaKey,
    year: null,
    mediaType: "movie",
    overview: null,
    posterUrl: null,
    genres: [],
    runtime: null,
    rating: null,
    freshness: null,
    providerAvailability: null,
    trailerUrl: null,
    fitExplanation: null,
  };
}

const recommendations = [
  recommendation("movie:1"),
  recommendation("movie:2"),
  recommendation("tv:3"),
] as const satisfies RecommendationCardSet;

describe("recommendation card model", () => {
  it("recognizes exactly three recommendation cards", () => {
    expect(isRecommendationCardSet(recommendations)).toBe(true);
    expect(isRecommendationCardSet(recommendations.slice(0, 2))).toBe(false);
    expect(
      isRecommendationCardSet([...recommendations, recommendation("tv:4")]),
    ).toBe(false);
  });

  it("replaces only the requested position without mutating the source", () => {
    const replacement = recommendation("movie:4");
    const result = replaceRecommendationAt(recommendations, 1, replacement);

    expect(result.map(({ mediaKey }) => mediaKey)).toEqual([
      "movie:1",
      "movie:4",
      "tv:3",
    ]);
    expect(recommendations.map(({ mediaKey }) => mediaKey)).toEqual([
      "movie:1",
      "movie:2",
      "tv:3",
    ]);
    expect(replaceRecommendationAt(recommendations, 3, replacement)).toBe(
      recommendations,
    );
  });

  it("formats only valid movie and episode runtimes", () => {
    expect(formatRuntime({ kind: "movie", minutes: 104 })).toBe("1h 44m");
    expect(formatRuntime({ kind: "episode", minutes: 48 })).toBe(
      "48m per episode",
    );
    expect(formatRuntime({ kind: "movie", minutes: 0 })).toBeNull();
    expect(formatRuntime(null)).toBeNull();
  });

  it("accepts only absolute HTTPS display URLs", () => {
    expect(safeHttpsUrl("https://example.com/poster.jpg")).toBe(
      "https://example.com/poster.jpg",
    );
    expect(safeHttpsUrl("http://example.com/poster.jpg")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("not a URL")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });

  it("uses uncertainty labels rather than rating-quality claims", () => {
    expect(ratingConfidenceLabels).toEqual({
      none: "No meaningful rating sample yet",
      low: "Limited rating evidence",
      medium: "Moderate rating evidence",
      established: "Established rating evidence",
      high: "High-volume rating evidence",
    });
  });
});
