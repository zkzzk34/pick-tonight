import type { RecommendationCardData } from "./recommendation-card-model";

export const WATCHLIST_STORAGE_KEY = "picktonight.watchlist" as const;
export const WATCHLIST_STORAGE_VERSION = 1 as const;

const LEGACY_WATCHLIST_STORAGE_VERSION = 0 as const;
const MAX_MEDIA_KEY_LENGTH = 200;
const MAX_TITLE_LENGTH = 300;
const MAX_POSTER_REFERENCE_LENGTH = 2_048;

export interface SavedTitle {
  readonly mediaKey: string;
  readonly mediaType: "movie" | "tv";
  readonly title: string;
  readonly year: number | null;
  readonly posterUrl: string | null;
}

interface WatchlistRecordV1 {
  readonly version: typeof WATCHLIST_STORAGE_VERSION;
  readonly items: readonly SavedTitle[];
}

export type WatchlistReadStatus =
  | "ready"
  | "missing"
  | "migrated"
  | "recovered"
  | "corrupt"
  | "unsupported"
  | "unavailable";

export interface WatchlistReadResult {
  readonly items: readonly SavedTitle[];
  readonly status: WatchlistReadStatus;
  readonly needsRewrite: boolean;
}

export type AddSavedTitleResult =
  | {
      readonly outcome: "added";
      readonly items: readonly SavedTitle[];
    }
  | {
      readonly outcome: "already-saved";
      readonly items: readonly SavedTitle[];
    };

interface ParsedSavedTitle {
  readonly item: SavedTitle;
  readonly changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maximumLength) {
    return null;
  }

  return normalized;
}

function normalizeYear(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1800 ||
    value > 9999
  ) {
    return null;
  }

  return value;
}

function normalizePosterReference(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_POSTER_REFERENCE_LENGTH
  ) {
    return null;
  }

  if (/^\/(?!\/)/.test(normalized)) {
    return normalized;
  }

  try {
    return new URL(normalized).protocol === "https:" ? normalized : null;
  } catch {
    return null;
  }
}

function hasExactKeys(
  candidate: Record<string, unknown>,
  expectedKeys: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(candidate);

  return (
    keys.length === expectedKeys.size &&
    keys.every((key) => expectedKeys.has(key))
  );
}

const currentSavedTitleKeys = new Set([
  "mediaKey",
  "mediaType",
  "title",
  "year",
  "posterUrl",
]);

const legacySavedTitleKeys = new Set([
  "mediaKey",
  "mediaType",
  "title",
  "year",
]);

function parseCurrentSavedTitle(value: unknown): ParsedSavedTitle | null {
  if (!isRecord(value)) {
    return null;
  }

  const mediaKey = normalizeRequiredText(value.mediaKey, MAX_MEDIA_KEY_LENGTH);
  const title = normalizeRequiredText(value.title, MAX_TITLE_LENGTH);

  if (
    mediaKey === null ||
    title === null ||
    (value.mediaType !== "movie" && value.mediaType !== "tv")
  ) {
    return null;
  }

  const year = normalizeYear(value.year);
  const posterUrl = normalizePosterReference(value.posterUrl);

  return {
    item: {
      mediaKey,
      mediaType: value.mediaType,
      title,
      year,
      posterUrl,
    },
    changed:
      !hasExactKeys(value, currentSavedTitleKeys) ||
      value.mediaKey !== mediaKey ||
      value.title !== title ||
      value.year !== year ||
      value.posterUrl !== posterUrl,
  };
}

function parseLegacySavedTitle(value: unknown): ParsedSavedTitle | null {
  if (!isRecord(value)) {
    return null;
  }

  const mediaKey = normalizeRequiredText(value.mediaKey, MAX_MEDIA_KEY_LENGTH);
  const title = normalizeRequiredText(value.title, MAX_TITLE_LENGTH);

  if (
    mediaKey === null ||
    title === null ||
    (value.mediaType !== "movie" && value.mediaType !== "tv")
  ) {
    return null;
  }

  const year = normalizeYear(value.year);

  return {
    item: {
      mediaKey,
      mediaType: value.mediaType,
      title,
      year,
      posterUrl: null,
    },
    changed:
      !hasExactKeys(value, legacySavedTitleKeys) ||
      value.mediaKey !== mediaKey ||
      value.title !== title ||
      value.year !== year,
  };
}

function normalizeSavedTitles(
  values: readonly unknown[],
  parser: (value: unknown) => ParsedSavedTitle | null,
): {
  readonly items: readonly SavedTitle[];
  readonly changed: boolean;
} {
  const items: SavedTitle[] = [];
  const seenMediaKeys = new Set<string>();
  let changed = false;

  for (const value of values) {
    const parsed = parser(value);

    if (parsed === null) {
      changed = true;
      continue;
    }

    if (seenMediaKeys.has(parsed.item.mediaKey)) {
      changed = true;
      continue;
    }

    seenMediaKeys.add(parsed.item.mediaKey);
    items.push(parsed.item);
    changed ||= parsed.changed;
  }

  return { items, changed };
}

function parseWatchlistRecord(serialized: string): WatchlistReadResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      items: [],
      status: "corrupt",
      needsRewrite: false,
    };
  }

  if (!isRecord(parsed)) {
    return {
      items: [],
      status: "corrupt",
      needsRewrite: false,
    };
  }

  if (parsed.version === LEGACY_WATCHLIST_STORAGE_VERSION) {
    if (!Array.isArray(parsed.items)) {
      return {
        items: [],
        status: "corrupt",
        needsRewrite: false,
      };
    }

    const normalized = normalizeSavedTitles(
      parsed.items,
      parseLegacySavedTitle,
    );

    return {
      items: normalized.items,
      status: "migrated",
      needsRewrite: true,
    };
  }

  if (parsed.version === WATCHLIST_STORAGE_VERSION) {
    if (!Array.isArray(parsed.items)) {
      return {
        items: [],
        status: "corrupt",
        needsRewrite: false,
      };
    }

    const normalized = normalizeSavedTitles(
      parsed.items,
      parseCurrentSavedTitle,
    );
    const topLevelChanged = !hasExactKeys(
      parsed,
      new Set(["version", "items"]),
    );
    const recovered = topLevelChanged || normalized.changed;

    return {
      items: normalized.items,
      status: recovered ? "recovered" : "ready",
      needsRewrite: recovered,
    };
  }

  if (typeof parsed.version === "number") {
    return {
      items: [],
      status: "unsupported",
      needsRewrite: false,
    };
  }

  return {
    items: [],
    status: "corrupt",
    needsRewrite: false,
  };
}

export function getWatchlistStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readWatchlist(storage: Storage | null): WatchlistReadResult {
  if (storage === null) {
    return {
      items: [],
      status: "unavailable",
      needsRewrite: false,
    };
  }

  try {
    const serialized = storage.getItem(WATCHLIST_STORAGE_KEY);

    if (serialized === null) {
      return {
        items: [],
        status: "missing",
        needsRewrite: false,
      };
    }

    return parseWatchlistRecord(serialized);
  } catch {
    return {
      items: [],
      status: "unavailable",
      needsRewrite: false,
    };
  }
}

export function writeWatchlist(
  storage: Storage | null,
  items: readonly SavedTitle[],
): boolean {
  if (storage === null) {
    return false;
  }

  const normalized = normalizeSavedTitles(items, parseCurrentSavedTitle);
  const record: WatchlistRecordV1 = {
    version: WATCHLIST_STORAGE_VERSION,
    items: normalized.items,
  };

  try {
    storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearWatchlist(storage: Storage | null): boolean {
  if (storage === null) {
    return false;
  }

  try {
    storage.removeItem(WATCHLIST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createSavedTitle(
  recommendation: RecommendationCardData,
): SavedTitle {
  const mediaKey = normalizeRequiredText(
    recommendation.mediaKey,
    MAX_MEDIA_KEY_LENGTH,
  );
  const title = normalizeRequiredText(recommendation.title, MAX_TITLE_LENGTH);

  if (mediaKey === null || title === null) {
    throw new Error("A saved title requires a stable media key and title.");
  }

  return {
    mediaKey,
    mediaType: recommendation.mediaType,
    title,
    year: normalizeYear(recommendation.year),
    posterUrl: normalizePosterReference(recommendation.posterUrl),
  };
}

export function addSavedTitle(
  items: readonly SavedTitle[],
  title: SavedTitle,
): AddSavedTitleResult {
  if (items.some(({ mediaKey }) => mediaKey === title.mediaKey)) {
    return {
      outcome: "already-saved",
      items,
    };
  }

  return {
    outcome: "added",
    items: [title, ...items],
  };
}

export function removeSavedTitle(
  items: readonly SavedTitle[],
  mediaKey: string,
): readonly SavedTitle[] {
  if (!items.some((item) => item.mediaKey === mediaKey)) {
    return items;
  }

  return items.filter((item) => item.mediaKey !== mediaKey);
}

export function isTitleSaved(
  items: readonly SavedTitle[],
  mediaKey: string,
): boolean {
  return items.some((item) => item.mediaKey === mediaKey);
}
