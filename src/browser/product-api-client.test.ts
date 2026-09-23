import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import type { RecommendationCardData } from "./recommendation-card-model";
import {
  requestProductRecommendationBatch,
  requestProductTitleDetail,
} from "./product-api-client";

const request: RecommendationRequest = {
  hardRestrictions: {
    mediaType: "movie",
    maximumRuntimeMinutes: 120,
  },
  softPreferences: {
    mood: "laughing",
    preferredGenreIds: [35],
  },
  watchRegion: "US",
};

function productRecommendation(id: number, title: string) {
  return {
    mediaKey: `movie:${id}`,
    title,
    year: 2024,
    mediaType: "movie" as const,
    decisionEvidence: {
      candidateAgeCode: "established" as const,
      ratingConfidenceCode: "strong" as const,
    },
    overview: `${title} overview`,
    posterUrl: null,
    genres: ["Comedy"],
    runtime: {
      kind: "movie" as const,
      minutes: 100,
    },
    rating: {
      average: 7.8,
      voteCount: 800,
      confidence: "high" as const,
    },
    freshness: {
      label: "Released in 2024",
      basis: "release-date" as const,
    },
    providerAvailability: {
      source: "justwatch" as const,
      watchRegion: "US",
      providerNames: ["Example Stream"],
    },
    trailerUrl: null,
    explanation: {
      summary: "This title stands out for the reasons below.",
      reasons: [
        {
          kind: "verified-constraint" as const,
          code: "runtime-within-limit" as const,
          text: "Fits within your 120-minute runtime limit.",
        },
        {
          kind: "soft-match" as const,
          code: "preferred-genre-match" as const,
          text: "Matches one of your preferred genres.",
        },
      ],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("product API browser client", () => {
  it("requests exactly three live recommendations with bounded exclusions", async () => {
    let capturedBody = "";

    vi.stubGlobal(
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");

        return new Response(
          JSON.stringify({
            data: {
              recommendations: [
                productRecommendation(101, "Movie 101"),
                productRecommendation(102, "Movie 102"),
                productRecommendation(103, "Movie 103"),
              ],
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );

    const result = await requestProductRecommendationBatch(request, 3, {
      shownMediaKeys: ["movie:90"],
      removedMediaKeys: ["movie:91"],
    });

    expect(result.status).toBe("complete");

    if (result.status !== "complete") {
      throw new Error("Expected complete recommendation result.");
    }

    expect(result.recommendations.map(({ title }) => title)).toEqual([
      "Movie 101",
      "Movie 102",
      "Movie 103",
    ]);

    expect(result.recommendations[0]?.fitExplanation).toEqual({
      source: "structured-recommendation-evidence",
      text: "This title stands out for the reasons below.",
      reasons: [
        {
          kind: "verified",
          label: "Runtime verified",
          text: "Fits within your 120-minute runtime limit.",
        },
        {
          kind: "soft-match",
          label: "Genre match",
          text: "Matches one of your preferred genres.",
        },
      ],
    });

    expect(JSON.parse(capturedBody)).toEqual({
      request,
      requestedCount: 3,
      exclusions: {
        shownMediaKeys: ["movie:90"],
        removedMediaKeys: ["movie:91"],
      },
    });
  });

  it("maps one title-detail response while retaining recommendation-fit evidence", async () => {
    let capturedUrl = "";

    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      capturedUrl = String(input);

      return new Response(
        JSON.stringify({
          data: {
            mediaKey: "movie:101",
            title: "Movie 101",
            year: 2024,
            mediaType: "movie",
            overview: "Full current overview",
            posterUrl: null,
            genres: ["Comedy"],
            runtime: {
              kind: "movie",
              minutes: 100,
            },
            rating: {
              average: 7.8,
              voteCount: 800,
              confidence: "high",
            },
            freshness: {
              label: "Released in 2024",
              basis: "release-date",
            },
            watchRegion: "US",
            providerAvailability: {
              source: "justwatch",
              watchRegion: "US",
              tmdbUrl: null,
              streaming: ["Example Stream"],
              free: [],
              ads: [],
              rent: [],
              buy: [],
            },
            trailerUrl: null,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    const card: RecommendationCardData = {
      ...productRecommendation(101, "Movie 101"),
      fitExplanation: {
        source: "structured-recommendation-evidence",
        text: "This title stands out for the reasons below.",
        reasons: [
          {
            kind: "verified",
            label: "Runtime verified",
            text: "Fits within your 120-minute runtime limit.",
          },
        ],
      },
    };

    const result = await requestProductTitleDetail(card, "US");

    expect(result.status).toBe("complete");

    if (result.status !== "complete") {
      throw new Error("Expected complete title-detail result.");
    }

    expect(capturedUrl).toBe("/api/titles/movie/101?watchRegion=US");
    expect(result.detail.overview).toBe("Full current overview");
    expect(result.detail.fitExplanation?.reasons).toEqual([
      {
        kind: "verified",
        label: "Runtime verified",
        text: "Fits within your 120-minute runtime limit.",
      },
    ]);
  });

  it("treats malformed successful API payloads as upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ data: { recommendations: [{}] } }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    );

    await expect(
      requestProductRecommendationBatch(request, 1),
    ).resolves.toEqual({
      status: "error",
      failure: "upstream",
    });
  });
});
