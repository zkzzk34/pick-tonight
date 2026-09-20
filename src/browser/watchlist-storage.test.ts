import { describe, expect, it } from "vitest";

import type { RecommendationCardData } from "./recommendation-card-model";
import {
  WATCHLIST_STORAGE_KEY,
  addSavedTitle,
  clearWatchlist,
  createSavedTitle,
  isTitleSaved,
  readWatchlist,
  removeSavedTitle,
  writeWatchlist,
  type SavedTitle,
} from "./watchlist-storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const unavailableStorage: Storage = {
  get length(): number {
    throw new Error("Storage unavailable");
  },
  clear() {
    throw new Error("Storage unavailable");
  },
  getItem() {
    throw new Error("Storage unavailable");
  },
  key() {
    throw new Error("Storage unavailable");
  },
  removeItem() {
    throw new Error("Storage unavailable");
  },
  setItem() {
    throw new Error("Storage unavailable");
  },
};

const recommendation: RecommendationCardData = {
  mediaKey: "movie:101",
  title: "Example Movie",
  year: 1995,
  mediaType: "movie",
  decisionEvidence: {
    candidateAgeCode: "established",
    ratingConfidenceCode: "strong",
  },
  overview: "This overview must never enter the watchlist.",
  posterUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
  genres: ["Drama", "Comedy"],
  runtime: {
    kind: "movie",
    minutes: 108,
  },
  rating: {
    average: 8.1,
    voteCount: 2_000,
    confidence: "established",
  },
  freshness: {
    label: "Released in 1995",
    basis: "release-date",
  },
  providerAvailability: {
    source: "justwatch",
    watchRegion: "US",
    providerNames: ["Example Streaming"],
  },
  trailerUrl: "https://www.youtube.com/watch?v=example",
  fitExplanation: {
    source: "structured-recommendation-evidence",
    text: "A sample explanation that must not be persisted.",
  },
};

const secondTitle: SavedTitle = {
  mediaKey: "tv:202",
  mediaType: "tv",
  title: "Example Television",
  year: 2001,
  posterUrl: null,
};

describe("watchlist storage", () => {
  it("creates only the minimal normalized saved-title record", () => {
    const saved = createSavedTitle(recommendation);

    expect(saved).toEqual({
      mediaKey: "movie:101",
      mediaType: "movie",
      title: "Example Movie",
      year: 1995,
      posterUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
    });

    expect(Object.keys(saved)).toEqual([
      "mediaKey",
      "mediaType",
      "title",
      "year",
      "posterUrl",
    ]);
    expect(saved).not.toHaveProperty("overview");
    expect(saved).not.toHaveProperty("genres");
    expect(saved).not.toHaveProperty("providerAvailability");
    expect(saved).not.toHaveProperty("fitExplanation");
  });

  it("stores and restores a versioned watchlist in array order", () => {
    const storage = new MemoryStorage();
    const firstTitle = createSavedTitle(recommendation);
    const items = [secondTitle, firstTitle];

    expect(writeWatchlist(storage, items)).toBe(true);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe(
      '{"version":1,"items":[{"mediaKey":"tv:202","mediaType":"tv","title":"Example Television","year":2001,"posterUrl":null},{"mediaKey":"movie:101","mediaType":"movie","title":"Example Movie","year":1995,"posterUrl":"https://image.tmdb.org/t/p/w500/example.jpg"}]}',
    );

    expect(readWatchlist(storage)).toEqual({
      items,
      status: "ready",
      needsRewrite: false,
    });
  });

  it("prepends new titles and keeps duplicate saves idempotent", () => {
    const firstTitle = createSavedTitle(recommendation);
    const firstSave = addSavedTitle([], firstTitle);
    const secondSave = addSavedTitle(firstSave.items, secondTitle);
    const duplicateSave = addSavedTitle(secondSave.items, firstTitle);

    expect(firstSave).toEqual({
      outcome: "added",
      items: [firstTitle],
    });
    expect(secondSave).toEqual({
      outcome: "added",
      items: [secondTitle, firstTitle],
    });
    expect(duplicateSave.outcome).toBe("already-saved");
    expect(duplicateSave.items).toBe(secondSave.items);
  });

  it("removes one saved title without changing unrelated titles", () => {
    const firstTitle = createSavedTitle(recommendation);
    const items = [secondTitle, firstTitle];

    expect(removeSavedTitle(items, secondTitle.mediaKey)).toEqual([firstTitle]);
    expect(removeSavedTitle(items, "movie:missing")).toBe(items);
    expect(isTitleSaved(items, firstTitle.mediaKey)).toBe(true);
    expect(isTitleSaved(items, "movie:missing")).toBe(false);
  });

  it("migrates a legacy version-zero record without inventing metadata", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify({
        version: 0,
        items: [
          {
            mediaKey: "movie:303",
            mediaType: "movie",
            title: "Legacy Movie",
            year: 1988,
          },
        ],
      }),
    );

    const migrated = readWatchlist(storage);

    expect(migrated).toEqual({
      items: [
        {
          mediaKey: "movie:303",
          mediaType: "movie",
          title: "Legacy Movie",
          year: 1988,
          posterUrl: null,
        },
      ],
      status: "migrated",
      needsRewrite: true,
    });

    expect(writeWatchlist(storage, migrated.items)).toBe(true);
    expect(readWatchlist(storage)).toEqual({
      items: migrated.items,
      status: "ready",
      needsRewrite: false,
    });
  });

  it("salvages valid entries, removes duplicates, and strips extra data", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        extraTopLevelValue: "remove me",
        items: [
          {
            mediaKey: " movie:101 ",
            mediaType: "movie",
            title: " Example Movie ",
            year: 1995,
            posterUrl: "javascript:alert(1)",
            overview: "remove me",
          },
          {
            mediaKey: "movie:101",
            mediaType: "movie",
            title: "Duplicate",
            year: 1995,
            posterUrl: null,
          },
          {
            mediaKey: "",
            mediaType: "movie",
            title: "Invalid",
            year: 2000,
            posterUrl: null,
          },
          secondTitle,
        ],
      }),
    );

    expect(readWatchlist(storage)).toEqual({
      items: [
        {
          mediaKey: "movie:101",
          mediaType: "movie",
          title: "Example Movie",
          year: 1995,
          posterUrl: null,
        },
        secondTitle,
      ],
      status: "recovered",
      needsRewrite: true,
    });
  });

  it("treats malformed storage as empty without deleting it automatically", () => {
    const storage = new MemoryStorage();

    storage.setItem(WATCHLIST_STORAGE_KEY, "not-json");

    expect(readWatchlist(storage)).toEqual({
      items: [],
      status: "corrupt",
      needsRewrite: false,
    });
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe("not-json");
  });

  it("does not overwrite records written by an unknown future version", () => {
    const storage = new MemoryStorage();
    const futureRecord = '{"version":99,"items":[]}';

    storage.setItem(WATCHLIST_STORAGE_KEY, futureRecord);

    expect(readWatchlist(storage)).toEqual({
      items: [],
      status: "unsupported",
      needsRewrite: false,
    });
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe(futureRecord);
  });

  it("handles missing and explicitly cleared storage safely", () => {
    const storage = new MemoryStorage();

    expect(readWatchlist(storage)).toEqual({
      items: [],
      status: "missing",
      needsRewrite: false,
    });

    storage.setItem("picktonight.other-data", "keep-me");
    expect(writeWatchlist(storage, [secondTitle])).toBe(true);
    expect(clearWatchlist(storage)).toBe(true);

    expect(readWatchlist(storage)).toEqual({
      items: [],
      status: "missing",
      needsRewrite: false,
    });
    expect(storage.getItem("picktonight.other-data")).toBe("keep-me");
  });

  it("fails safely when browser storage is unavailable", () => {
    expect(readWatchlist(null)).toEqual({
      items: [],
      status: "unavailable",
      needsRewrite: false,
    });
    expect(readWatchlist(unavailableStorage)).toEqual({
      items: [],
      status: "unavailable",
      needsRewrite: false,
    });

    expect(writeWatchlist(null, [secondTitle])).toBe(false);
    expect(writeWatchlist(unavailableStorage, [secondTitle])).toBe(false);
    expect(clearWatchlist(null)).toBe(false);
    expect(clearWatchlist(unavailableStorage)).toBe(false);
  });
});
