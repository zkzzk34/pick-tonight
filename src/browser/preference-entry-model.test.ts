import { describe, expect, it } from "vitest";

import {
  createDefaultPreferenceDraft,
  getGenreOptions,
  interpretPreferences,
  parsePreferenceText,
} from "./preference-entry-model";

describe("preference entry model", () => {
  it("deterministically interprets a supported text-only request", () => {
    const interpretation = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      rawText: "funny Korean movie under two hours",
    });

    expect(interpretation.request).toEqual({
      hardRestrictions: {
        mediaType: "movie",
        maximumRuntimeMinutes: 120,
      },
      softPreferences: {
        mood: "laughing",
        originCountry: "KR",
      },
      watchRegion: "US",
    });

    expect(interpretation.unsupportedText).toEqual([]);
    expect(interpretation.selectivity.label).toBe("Very specific");
  });

  it("keeps ambiguous unsupported text visible without guessing", () => {
    const parsed = parsePreferenceText("something light to watch with friends");

    expect(parsed.companion).toBe("friends");
    expect(parsed.unsupportedText).toEqual(["light"]);
  });

  it("lets explicit controls override conflicting text", () => {
    const interpretation = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      rawText: "funny movie",
      mediaType: "tv",
      mood: "romantic",
    });

    expect(interpretation.request.hardRestrictions?.mediaType).toBe("tv");
    expect(interpretation.request.softPreferences?.mood).toBe("romantic");
    expect(interpretation.conflicts).toHaveLength(2);
  });

  it("maps preferred and excluded genres into media-aware TMDB IDs", () => {
    const interpretation = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      mediaType: "movie",
      preferredGenreKeys: ["comedy"],
      excludedGenreKeys: ["horror"],
    });

    expect(interpretation.request.softPreferences?.preferredGenreIds).toEqual([
      35,
    ]);

    expect(interpretation.request.hardRestrictions?.excludedGenreIds).toEqual([
      27,
    ]);
  });

  it("exposes only cross-media genre IDs for Either", () => {
    const eitherGenres = getGenreOptions("either");

    expect(eitherGenres.some((genre) => genre.key === "comedy")).toBe(true);
    expect(eitherGenres.some((genre) => genre.key === "horror")).toBe(false);
    expect(eitherGenres.some((genre) => genre.key === "romance")).toBe(false);
  });

  it("keeps an empty request valid and broad", () => {
    const interpretation = interpretPreferences(createDefaultPreferenceDraft());

    expect(interpretation.request).toEqual({
      watchRegion: "US",
    });

    expect(interpretation.selectivity).toMatchObject({
      score: 0,
      label: "Broad",
    });
  });

  it("uses the accepted weighted selectivity thresholds", () => {
    const focused = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      mood: "laughing",
      preferredGenreKeys: ["comedy"],
    });

    expect(focused.selectivity).toMatchObject({
      score: 2,
      label: "Focused",
    });

    const verySpecific = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      mediaType: "movie",
      mood: "laughing",
      maximumRuntimeMinutes: 120,
      preferredGenreKeys: ["comedy"],
    });

    expect(verySpecific.selectivity).toMatchObject({
      score: 5,
      label: "Very specific",
    });
  });

  it("does not send companion context into the current API request", () => {
    const interpretation = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      companion: "friends",
    });

    expect(interpretation.resolved.companion).toBe("friends");
    expect(JSON.stringify(interpretation.request)).not.toContain("companion");
  });

  it("clears provider restrictions outside the US shortlist region", () => {
    const interpretation = interpretPreferences({
      ...createDefaultPreferenceDraft(),
      watchRegion: "GB",
      requiredProviderIds: [8, 9],
    });

    expect(
      interpretation.request.hardRestrictions?.requiredProviderIds,
    ).toBeUndefined();

    expect(interpretation.request.watchRegion).toBe("GB");
  });
});
