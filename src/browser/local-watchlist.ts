import { useCallback, useMemo, useRef, useState } from "react";

import type { RecommendationCardData } from "./recommendation-card-model";
import {
  addSavedTitle,
  clearWatchlist,
  createSavedTitle,
  getWatchlistStorage,
  readWatchlist,
  removeSavedTitle,
  writeWatchlist,
  type SavedTitle,
  type WatchlistReadStatus,
} from "./watchlist-storage";

export type WatchlistPersistence = "persistent" | "session-only";

export interface SaveToWatchlistResult {
  readonly outcome: "added" | "already-saved";
  readonly persistence: WatchlistPersistence;
}

export type SaveToWatchlist = (
  recommendation: RecommendationCardData,
) => SaveToWatchlistResult;

export interface RemoveFromWatchlistResult {
  readonly outcome: "removed" | "not-found";
  readonly persistence: WatchlistPersistence;
}

export interface ClearWatchlistResult {
  readonly persistence: WatchlistPersistence;
}

export interface LocalWatchlist {
  readonly savedTitles: readonly SavedTitle[];
  readonly savedMediaKeys: ReadonlySet<string>;
  readonly persistence: WatchlistPersistence;
  readonly initialReadStatus: WatchlistReadStatus;
  readonly saveTitle: SaveToWatchlist;
  readonly removeTitle: (mediaKey: string) => RemoveFromWatchlistResult;
  readonly clearTitles: () => ClearWatchlistResult;
}

function loadInitialWatchlist() {
  const storage = getWatchlistStorage();

  return {
    storage,
    readResult: readWatchlist(storage),
  };
}

export function useLocalWatchlist(): LocalWatchlist {
  const [initial] = useState(loadInitialWatchlist);
  const storageRef = useRef(initial.storage);
  const [savedTitles, setSavedTitles] = useState<readonly SavedTitle[]>(
    initial.readResult.items,
  );
  const [persistence, setPersistence] = useState<WatchlistPersistence>(
    initial.readResult.status === "unavailable" ? "session-only" : "persistent",
  );

  const savedMediaKeys = useMemo<ReadonlySet<string>>(
    () => new Set(savedTitles.map(({ mediaKey }) => mediaKey)),
    [savedTitles],
  );

  const saveTitle = useCallback<SaveToWatchlist>(
    (recommendation) => {
      const savedTitle = createSavedTitle(recommendation);
      const update = addSavedTitle(savedTitles, savedTitle);

      if (update.outcome === "already-saved") {
        return {
          outcome: update.outcome,
          persistence,
        };
      }

      const persisted = writeWatchlist(storageRef.current, update.items);
      const nextPersistence: WatchlistPersistence = persisted
        ? "persistent"
        : "session-only";

      setSavedTitles(update.items);
      setPersistence(nextPersistence);

      return {
        outcome: update.outcome,
        persistence: nextPersistence,
      };
    },
    [persistence, savedTitles],
  );

  const removeTitle = useCallback(
    (mediaKey: string): RemoveFromWatchlistResult => {
      const updatedTitles = removeSavedTitle(savedTitles, mediaKey);

      if (updatedTitles === savedTitles) {
        return {
          outcome: "not-found",
          persistence,
        };
      }

      const persisted = writeWatchlist(storageRef.current, updatedTitles);
      const nextPersistence: WatchlistPersistence = persisted
        ? "persistent"
        : "session-only";

      setSavedTitles(updatedTitles);
      setPersistence(nextPersistence);

      return {
        outcome: "removed",
        persistence: nextPersistence,
      };
    },
    [persistence, savedTitles],
  );

  const clearTitles = useCallback((): ClearWatchlistResult => {
    const persisted = clearWatchlist(storageRef.current);
    const nextPersistence: WatchlistPersistence = persisted
      ? "persistent"
      : "session-only";

    setSavedTitles([]);
    setPersistence(nextPersistence);

    return {
      persistence: nextPersistence,
    };
  }, []);

  return {
    savedTitles,
    savedMediaKeys,
    persistence,
    initialReadStatus: initial.readResult.status,
    saveTitle,
    removeTitle,
    clearTitles,
  };
}
