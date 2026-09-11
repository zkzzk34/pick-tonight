import { describe, expect, it } from "vitest";

import type { RecommendationRequest } from "../shared/recommendation-contracts";
import {
  recommendationFailureCopy,
  RECOMMENDATION_FAILURE_KINDS,
  snapshotRecommendationRequest,
  type RecommendationFailureKind,
} from "./recommendation-request-state";

describe("recommendation request state model", () => {
  it("takes a detached snapshot of every submitted preference", () => {
    const request: RecommendationRequest = {
      hardRestrictions: {
        mediaType: "movie",
        excludedGenreIds: [27],
        maximumRuntimeMinutes: 120,
        requiredProviderIds: [8],
      },
      softPreferences: {
        mood: "laughing",
        preferredGenreIds: [35],
        contentLanguage: "en",
        originCountry: "US",
      },
      watchRegion: "US",
    };

    const snapshot = snapshotRecommendationRequest(request);

    request.hardRestrictions?.excludedGenreIds?.push(53);
    request.hardRestrictions?.requiredProviderIds?.push(9);
    request.softPreferences?.preferredGenreIds?.push(12);

    expect(snapshot).toEqual({
      hardRestrictions: {
        mediaType: "movie",
        excludedGenreIds: [27],
        maximumRuntimeMinutes: 120,
        requiredProviderIds: [8],
      },
      softPreferences: {
        mood: "laughing",
        preferredGenreIds: [35],
        contentLanguage: "en",
        originCountry: "US",
      },
      watchRegion: "US",
    });
    expect(snapshot).not.toBe(request);
    expect(snapshot.hardRestrictions).not.toBe(request.hardRestrictions);
    expect(snapshot.softPreferences).not.toBe(request.softPreferences);
  });

  it("provides fixed user-safe copy for every supported failure", () => {
    const expectedCopy = {
      validation: {
        title: "Check your preferences",
        message:
          "Some submitted preferences could not be used. Review them and try again.",
      },
      authentication: {
        title: "Recommendations are temporarily unavailable",
        message:
          "PickTonight cannot securely access recommendation data right now. Try again later.",
      },
      timeout: {
        title: "The request took too long",
        message:
          "PickTonight could not finish in time. Try the same preferences again.",
      },
      upstream: {
        title: "Recommendations are temporarily unavailable",
        message:
          "PickTonight could not finish this request. Try again shortly.",
      },
    } as const satisfies Record<
      RecommendationFailureKind,
      { readonly title: string; readonly message: string }
    >;

    for (const failure of RECOMMENDATION_FAILURE_KINDS) {
      expect(recommendationFailureCopy(failure)).toEqual(expectedCopy[failure]);
    }
  });
});
