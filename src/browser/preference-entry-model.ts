import {
  MEDIA_TYPES,
  recommendationRequestSchema,
  type RecommendationRequest,
  type SupportedMood,
} from "../shared/recommendation-contracts";

export type PreferenceMediaType = (typeof MEDIA_TYPES)[number];

export type ViewingCompanion = "alone" | "partner" | "friends" | "family";

export type SelectivityLabel = "Broad" | "Focused" | "Very specific";

export interface PreferenceDraft {
  rawText: string;
  mediaType: PreferenceMediaType | null;
  mood: SupportedMood | null;
  maximumRuntimeMinutes: number | "any" | null;
  preferredGenreKeys: string[];
  excludedGenreKeys: string[];
  companion: ViewingCompanion | null;
  freshnessYear: number | null;
  contentLanguage: string | null;
  originCountry: string | null;
  watchRegion: string;
  requiredProviderIds: number[];
  suppressedKeys: string[];
}

interface GenreOption {
  readonly key: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly movieId?: number;
  readonly tvId?: number;
}

interface ParsedPreferenceText {
  mediaType?: PreferenceMediaType;
  mood?: SupportedMood;
  maximumRuntimeMinutes?: number;
  preferredGenreKeys: string[];
  excludedGenreKeys: string[];
  companion?: ViewingCompanion;
  freshnessYear?: number;
  contentLanguage?: string;
  originCountry?: string;
  unsupportedText: string[];
}

export interface ResolvedPreferences {
  mediaType?: PreferenceMediaType;
  mood?: SupportedMood;
  maximumRuntimeMinutes?: number;
  preferredGenreKeys: string[];
  excludedGenreKeys: string[];
  companion?: ViewingCompanion;
  freshnessYear?: number;
  contentLanguage?: string;
  originCountry?: string;
  watchRegion: string;
  requiredProviderIds: number[];
}

export interface SelectivitySummary {
  score: number;
  label: SelectivityLabel;
  explanation: string;
}

export interface PreferenceInterpretation {
  request: RecommendationRequest;
  resolved: ResolvedPreferences;
  unsupportedText: string[];
  conflicts: string[];
  selectivity: SelectivitySummary;
}

export const MEDIA_OPTIONS = [
  { value: "movie", label: "Movie" },
  { value: "tv", label: "TV" },
  { value: "either", label: "Either" },
] as const;

export const MOOD_OPTIONS = [
  { value: "relaxed", label: "Relaxed" },
  { value: "laughing", label: "Make me laugh" },
  { value: "excited", label: "Excited" },
  { value: "thoughtful", label: "Thoughtful" },
  { value: "romantic", label: "Romantic" },
  { value: "spooked", label: "Spooked" },
  { value: "surprised", label: "Surprise me" },
] as const;

export const TIME_OPTIONS = [
  { value: 30, label: "≤ 30 min" },
  { value: 60, label: "≤ 60 min" },
  { value: 90, label: "≤ 90 min" },
  { value: 120, label: "≤ 2 hr" },
  { value: "any", label: "Any length" },
] as const;

export const COMPANION_OPTIONS = [
  { value: "alone", label: "By myself" },
  { value: "partner", label: "Partner / date" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "de", label: "German" },
] as const;

export const ORIGIN_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "CN", label: "China" },
  { value: "IN", label: "India" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "ES", label: "Spain" },
] as const;

export const WATCH_REGION_OPTIONS = ORIGIN_OPTIONS;

/**
 * Static US-only MVP shortlist.
 *
 * TMDB provider IDs are provider-catalog identities, but provider availability
 * remains regional. Issue #27 intentionally does not add a browser provider
 * catalog route. These controls are therefore enabled only for watchRegion=US.
 */
export const PROVIDER_OPTIONS = [
  { id: 8, label: "Netflix" },
  { id: 9, label: "Prime Video" },
  { id: 337, label: "Disney+" },
  { id: 15, label: "Hulu" },
  { id: 1899, label: "Max" },
  { id: 350, label: "Apple TV+" },
] as const;

export const GENRE_OPTIONS: readonly GenreOption[] = [
  {
    key: "action",
    label: "Action",
    movieId: 28,
    aliases: ["action"],
  },
  {
    key: "adventure",
    label: "Adventure",
    movieId: 12,
    aliases: ["adventure"],
  },
  {
    key: "action-adventure",
    label: "Action & Adventure",
    tvId: 10759,
    aliases: ["action", "action adventure"],
  },
  {
    key: "animation",
    label: "Animation",
    movieId: 16,
    tvId: 16,
    aliases: ["animation", "animated"],
  },
  {
    key: "comedy",
    label: "Comedy",
    movieId: 35,
    tvId: 35,
    aliases: ["comedy"],
  },
  {
    key: "crime",
    label: "Crime",
    movieId: 80,
    tvId: 80,
    aliases: ["crime"],
  },
  {
    key: "documentary",
    label: "Documentary",
    movieId: 99,
    tvId: 99,
    aliases: ["documentary", "documentaries"],
  },
  {
    key: "drama",
    label: "Drama",
    movieId: 18,
    tvId: 18,
    aliases: ["drama"],
  },
  {
    key: "family",
    label: "Family",
    movieId: 10751,
    tvId: 10751,
    aliases: ["family"],
  },
  {
    key: "fantasy",
    label: "Fantasy",
    movieId: 14,
    aliases: ["fantasy"],
  },
  {
    key: "history",
    label: "History",
    movieId: 36,
    aliases: ["history", "historical"],
  },
  {
    key: "horror",
    label: "Horror",
    movieId: 27,
    aliases: ["horror"],
  },
  {
    key: "kids",
    label: "Kids",
    tvId: 10762,
    aliases: ["kids", "children"],
  },
  {
    key: "music",
    label: "Music",
    movieId: 10402,
    aliases: ["music", "musical"],
  },
  {
    key: "mystery",
    label: "Mystery",
    movieId: 9648,
    tvId: 9648,
    aliases: ["mystery"],
  },
  {
    key: "news",
    label: "News",
    tvId: 10763,
    aliases: ["news"],
  },
  {
    key: "reality",
    label: "Reality",
    tvId: 10764,
    aliases: ["reality"],
  },
  {
    key: "romance",
    label: "Romance",
    movieId: 10749,
    aliases: ["romance"],
  },
  {
    key: "science-fiction",
    label: "Science Fiction",
    movieId: 878,
    aliases: ["science fiction", "sci fi", "sci-fi"],
  },
  {
    key: "sci-fi-fantasy",
    label: "Sci-Fi & Fantasy",
    tvId: 10765,
    aliases: ["science fiction", "sci fi", "sci-fi", "fantasy"],
  },
  {
    key: "soap",
    label: "Soap",
    tvId: 10766,
    aliases: ["soap"],
  },
  {
    key: "talk",
    label: "Talk",
    tvId: 10767,
    aliases: ["talk show"],
  },
  {
    key: "thriller",
    label: "Thriller",
    movieId: 53,
    aliases: ["thriller"],
  },
  {
    key: "tv-movie",
    label: "TV Movie",
    movieId: 10770,
    aliases: ["tv movie"],
  },
  {
    key: "war",
    label: "War",
    movieId: 10752,
    aliases: ["war"],
  },
  {
    key: "war-politics",
    label: "War & Politics",
    tvId: 10768,
    aliases: ["war", "politics"],
  },
  {
    key: "western",
    label: "Western",
    movieId: 37,
    tvId: 37,
    aliases: ["western"],
  },
];

const QUICK_GENRE_KEYS: Record<PreferenceMediaType, readonly string[]> = {
  movie: ["comedy", "action", "drama", "mystery", "romance", "horror"],
  tv: ["comedy", "drama", "mystery", "crime", "animation", "family"],
  either: ["comedy", "drama", "mystery", "crime", "animation", "family"],
};

const SELECTIVITY_EXPLANATIONS: Record<SelectivityLabel, string> = {
  Broad: "You have left plenty of room for variety. You can continue now.",
  Focused: "A few preferences are narrowing the candidate set.",
  "Very specific": "Several requirements may leave fewer eligible titles.",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "anything",
  "for",
  "i",
  "is",
  "kind",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "right",
  "something",
  "that",
  "the",
  "to",
  "tonight",
  "want",
  "watch",
]);

const LANGUAGE_TEXT_RULES = [
  { code: "en", pattern: /\b(?:in english|english[-\s]language)\b/i },
  { code: "es", pattern: /\b(?:in spanish|spanish[-\s]language)\b/i },
  { code: "fr", pattern: /\b(?:in french|french[-\s]language)\b/i },
  { code: "ja", pattern: /\b(?:in japanese|japanese[-\s]language)\b/i },
  { code: "ko", pattern: /\b(?:in korean|korean[-\s]language)\b/i },
  { code: "zh", pattern: /\b(?:in chinese|chinese[-\s]language)\b/i },
  { code: "hi", pattern: /\b(?:in hindi|hindi[-\s]language)\b/i },
  { code: "de", pattern: /\b(?:in german|german[-\s]language)\b/i },
] as const;

const ORIGIN_TEXT_RULES = [
  { code: "US", pattern: /\b(?:american|u\.?s\.?)\b/i },
  { code: "GB", pattern: /\bbritish\b/i },
  { code: "JP", pattern: /\bjapanese\b/i },
  { code: "KR", pattern: /\bkorean\b/i },
  { code: "CN", pattern: /\bchinese\b/i },
  { code: "IN", pattern: /\bindian\b/i },
  { code: "FR", pattern: /\bfrench\b/i },
  { code: "DE", pattern: /\bgerman\b/i },
  { code: "ES", pattern: /\bspanish\b/i },
] as const;

const MOOD_TEXT_RULES: readonly {
  mood: SupportedMood;
  pattern: RegExp;
}[] = [
  {
    mood: "laughing",
    pattern: /\b(?:make me laugh|funny|hilarious|laughing)\b/i,
  },
  {
    mood: "relaxed",
    pattern: /\b(?:relaxed|relaxing|chill|easygoing)\b/i,
  },
  {
    mood: "excited",
    pattern: /\b(?:excited|exciting|high energy)\b/i,
  },
  {
    mood: "thoughtful",
    pattern: /\b(?:thoughtful|reflective|cerebral)\b/i,
  },
  {
    mood: "romantic",
    pattern: /\bromantic\b/i,
  },
  {
    mood: "spooked",
    pattern: /\b(?:spooked|spooky|scary)\b/i,
  },
  {
    mood: "surprised",
    pattern: /\b(?:surprise me|surprising)\b/i,
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string): string {
  return escapeRegex(alias).replace(/\\ /g, "[\\s-]+");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function genreIdForMedia(
  genre: GenreOption,
  mediaType: PreferenceMediaType,
): number | undefined {
  if (mediaType === "movie") {
    return genre.movieId;
  }

  if (mediaType === "tv") {
    return genre.tvId;
  }

  return genre.movieId !== undefined && genre.movieId === genre.tvId
    ? genre.movieId
    : undefined;
}

function consumeFirst(
  remaining: string,
  pattern: RegExp,
): { remaining: string; match: RegExpMatchArray | null } {
  const match = remaining.match(pattern);

  if (match?.index === undefined) {
    return { remaining, match: null };
  }

  const start = match.index;
  const end = start + match[0].length;

  return {
    remaining:
      remaining.slice(0, start) +
      " ".repeat(match[0].length) +
      remaining.slice(end),
    match,
  };
}

function consumeAll(
  remaining: string,
  pattern: RegExp,
): { remaining: string; matches: RegExpMatchArray[] } {
  const matches: RegExpMatchArray[] = [];
  let current = remaining;

  while (true) {
    const consumed = consumeFirst(current, pattern);

    if (consumed.match === null) {
      return { remaining: current, matches };
    }

    matches.push(consumed.match);
    current = consumed.remaining;
  }
}

function textRuntimeMinutes(remaining: string): {
  remaining: string;
  minutes?: number;
} {
  const minutePattern =
    /\b(?:(?:under|within|up to|less than)\s+)?(\d{1,3})\s*(?:minutes?|mins?|min)\b/i;
  const minuteResult = consumeFirst(remaining, minutePattern);

  if (minuteResult.match !== null) {
    const minutes = Number(minuteResult.match[1]);

    if (minutes > 0 && minutes <= 600) {
      return {
        remaining: minuteResult.remaining,
        minutes,
      };
    }
  }

  const hourPattern =
    /\b(?:(?:under|within|up to|less than)\s+)?(an|one|two|1|2)\s*(?:hours?|hrs?|hr)\b/i;
  const hourResult = consumeFirst(remaining, hourPattern);

  if (hourResult.match !== null) {
    const raw = hourResult.match[1].toLowerCase();
    const hours = raw === "two" || raw === "2" ? 2 : 1;

    return {
      remaining: hourResult.remaining,
      minutes: hours * 60,
    };
  }

  return { remaining };
}

export function getGenreOptions(
  mediaType: PreferenceMediaType,
): readonly GenreOption[] {
  return GENRE_OPTIONS.filter(
    (genre) => genreIdForMedia(genre, mediaType) !== undefined,
  );
}

export function getQuickGenreOptions(
  mediaType: PreferenceMediaType,
): readonly GenreOption[] {
  const allowed = new Set(QUICK_GENRE_KEYS[mediaType]);

  return getGenreOptions(mediaType).filter((genre) => allowed.has(genre.key));
}

export function getGenreLabel(key: string): string {
  return GENRE_OPTIONS.find((genre) => genre.key === key)?.label ?? key;
}

export function getProviderLabel(id: number): string {
  return (
    PROVIDER_OPTIONS.find((provider) => provider.id === id)?.label ??
    `Provider ${id}`
  );
}

export function getLanguageLabel(code: string): string {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === code)?.label ?? code
  );
}

export function getCountryLabel(code: string): string {
  return ORIGIN_OPTIONS.find((option) => option.value === code)?.label ?? code;
}

export function getMoodLabel(mood: SupportedMood): string {
  return MOOD_OPTIONS.find((option) => option.value === mood)?.label ?? mood;
}

export function getCompanionLabel(companion: ViewingCompanion): string {
  return (
    COMPANION_OPTIONS.find((option) => option.value === companion)?.label ??
    companion
  );
}

export function getMediaLabel(mediaType: PreferenceMediaType): string {
  return (
    MEDIA_OPTIONS.find((option) => option.value === mediaType)?.label ??
    mediaType
  );
}

export function createDefaultPreferenceDraft(): PreferenceDraft {
  return {
    rawText: "",
    mediaType: null,
    mood: null,
    maximumRuntimeMinutes: null,
    preferredGenreKeys: [],
    excludedGenreKeys: [],
    companion: null,
    freshnessYear: null,
    contentLanguage: null,
    originCountry: null,
    watchRegion: "US",
    requiredProviderIds: [],
    suppressedKeys: [],
  };
}

export function parsePreferenceText(text: string): ParsedPreferenceText {
  let remaining = text.toLowerCase();
  const preferredGenreKeys: string[] = [];
  const excludedGenreKeys: string[] = [];

  let mediaType: PreferenceMediaType | undefined;
  let mood: SupportedMood | undefined;
  let companion: ViewingCompanion | undefined;
  let freshnessYear: number | undefined;
  let contentLanguage: string | undefined;
  let originCountry: string | undefined;

  const movieResult = consumeAll(remaining, /\b(?:movie|film)\b/i);
  remaining = movieResult.remaining;

  const televisionResult = consumeAll(
    remaining,
    /\b(?:tv|television|show|series)\b/i,
  );
  remaining = televisionResult.remaining;

  if (movieResult.matches.length > 0 && televisionResult.matches.length > 0) {
    mediaType = "either";
  } else if (movieResult.matches.length > 0) {
    mediaType = "movie";
  } else if (televisionResult.matches.length > 0) {
    mediaType = "tv";
  }

  const runtimeResult = textRuntimeMinutes(remaining);
  remaining = runtimeResult.remaining;
  const maximumRuntimeMinutes = runtimeResult.minutes;

  const freshnessResult = consumeFirst(
    remaining,
    /\b(?:released\s+)?since\s+((?:19|20)\d{2})\b/i,
  );
  remaining = freshnessResult.remaining;

  if (freshnessResult.match !== null) {
    freshnessYear = Number(freshnessResult.match[1]);
  }

  for (const rule of LANGUAGE_TEXT_RULES) {
    const result = consumeFirst(remaining, rule.pattern);

    if (result.match !== null) {
      contentLanguage = rule.code;
      remaining = result.remaining;
      break;
    }
  }

  for (const rule of ORIGIN_TEXT_RULES) {
    const result = consumeFirst(remaining, rule.pattern);

    if (result.match !== null) {
      originCountry = rule.code;
      remaining = result.remaining;
      break;
    }
  }

  const companionRules: readonly {
    companion: ViewingCompanion;
    pattern: RegExp;
  }[] = [
    {
      companion: "friends",
      pattern: /\b(?:with friends|with my friends)\b/i,
    },
    {
      companion: "partner",
      pattern:
        /\b(?:with my partner|with a partner|date night|with my date)\b/i,
    },
    {
      companion: "family",
      pattern: /\b(?:with family|with my family)\b/i,
    },
    {
      companion: "alone",
      pattern: /\b(?:alone|by myself)\b/i,
    },
  ];

  for (const rule of companionRules) {
    const result = consumeFirst(remaining, rule.pattern);

    if (result.match !== null) {
      companion = rule.companion;
      remaining = result.remaining;
      break;
    }
  }

  for (const rule of MOOD_TEXT_RULES) {
    const result = consumeFirst(remaining, rule.pattern);

    if (result.match !== null) {
      mood = rule.mood;
      remaining = result.remaining;
      break;
    }
  }

  const parserMediaType = mediaType ?? "either";
  const genreOptions = getGenreOptions(parserMediaType);

  for (const genre of genreOptions) {
    for (const alias of genre.aliases) {
      const aliasSource = aliasPattern(alias);
      const exclusion = consumeFirst(
        remaining,
        new RegExp(`\\b(?:no|not|avoid|without)\\s+${aliasSource}\\b`, "i"),
      );

      if (exclusion.match !== null) {
        excludedGenreKeys.push(genre.key);
        remaining = exclusion.remaining;
        break;
      }

      const positive = consumeFirst(
        remaining,
        new RegExp(`\\b${aliasSource}\\b`, "i"),
      );

      if (positive.match !== null) {
        preferredGenreKeys.push(genre.key);
        remaining = positive.remaining;
        break;
      }
    }
  }

  const unsupportedText = unique(
    remaining
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0 && !STOP_WORDS.has(token)),
  );

  return {
    ...(mediaType === undefined ? {} : { mediaType }),
    ...(mood === undefined ? {} : { mood }),
    ...(maximumRuntimeMinutes === undefined ? {} : { maximumRuntimeMinutes }),
    preferredGenreKeys: unique(preferredGenreKeys),
    excludedGenreKeys: unique(excludedGenreKeys),
    ...(companion === undefined ? {} : { companion }),
    ...(freshnessYear === undefined ? {} : { freshnessYear }),
    ...(contentLanguage === undefined ? {} : { contentLanguage }),
    ...(originCountry === undefined ? {} : { originCountry }),
    unsupportedText,
  };
}

function calculateSelectivity(
  resolved: ResolvedPreferences,
): SelectivitySummary {
  let score = 0;

  if (resolved.mediaType === "movie" || resolved.mediaType === "tv") {
    score += 1;
  }

  score += resolved.excludedGenreKeys.length;

  if (resolved.maximumRuntimeMinutes !== undefined) {
    score += 2;
  }

  if (resolved.requiredProviderIds.length > 0) {
    score += 2;
  }

  score += resolved.preferredGenreKeys.length;

  if (resolved.mood !== undefined) {
    score += 1;
  }

  if (resolved.freshnessYear !== undefined) {
    score += 1;
  }

  if (resolved.contentLanguage !== undefined) {
    score += 1;
  }

  if (resolved.originCountry !== undefined) {
    score += 1;
  }

  if (resolved.companion !== undefined) {
    score += 0.5;
  }

  const label: SelectivityLabel =
    score < 2 ? "Broad" : score <= 4 ? "Focused" : "Very specific";

  return {
    score,
    label,
    explanation: SELECTIVITY_EXPLANATIONS[label],
  };
}

function genreKeysToIds(
  keys: readonly string[],
  mediaType: PreferenceMediaType,
): number[] {
  return unique(
    keys.flatMap((key) => {
      const genre = GENRE_OPTIONS.find((candidate) => candidate.key === key);

      if (!genre) {
        return [];
      }

      const id = genreIdForMedia(genre, mediaType);

      return id === undefined ? [] : [id];
    }),
  );
}

function isSuppressed(suppressed: ReadonlySet<string>, key: string): boolean {
  return suppressed.has(key);
}

export function interpretPreferences(
  draft: PreferenceDraft,
): PreferenceInterpretation {
  const parsed = parsePreferenceText(draft.rawText);
  const suppressed = new Set(draft.suppressedKeys);
  const conflicts: string[] = [];

  if (
    draft.mediaType !== null &&
    parsed.mediaType !== undefined &&
    draft.mediaType !== parsed.mediaType
  ) {
    conflicts.push(
      `Typed media "${getMediaLabel(parsed.mediaType)}" was overridden by your "${getMediaLabel(draft.mediaType)}" selection.`,
    );
  }

  if (
    draft.mood !== null &&
    parsed.mood !== undefined &&
    draft.mood !== parsed.mood
  ) {
    conflicts.push(
      `Typed mood "${getMoodLabel(parsed.mood)}" was overridden by your "${getMoodLabel(draft.mood)}" selection.`,
    );
  }

  if (
    draft.maximumRuntimeMinutes !== null &&
    parsed.maximumRuntimeMinutes !== undefined
  ) {
    const manual =
      draft.maximumRuntimeMinutes === "any"
        ? undefined
        : draft.maximumRuntimeMinutes;

    if (manual !== parsed.maximumRuntimeMinutes) {
      conflicts.push(
        "The available-time control overrides the time interpreted from your typed request.",
      );
    }
  }

  if (
    draft.companion !== null &&
    parsed.companion !== undefined &&
    draft.companion !== parsed.companion
  ) {
    conflicts.push(
      `Typed companion context "${getCompanionLabel(parsed.companion)}" was overridden by your "${getCompanionLabel(draft.companion)}" selection.`,
    );
  }

  if (
    draft.freshnessYear !== null &&
    parsed.freshnessYear !== undefined &&
    draft.freshnessYear !== parsed.freshnessYear
  ) {
    conflicts.push(
      "The released-since year control overrides the freshness interpreted from your typed request.",
    );
  }

  if (
    draft.contentLanguage !== null &&
    parsed.contentLanguage !== undefined &&
    draft.contentLanguage !== parsed.contentLanguage
  ) {
    conflicts.push(
      "The content-language control overrides the language interpreted from your typed request.",
    );
  }

  if (
    draft.originCountry !== null &&
    parsed.originCountry !== undefined &&
    draft.originCountry !== parsed.originCountry
  ) {
    conflicts.push(
      "The origin-country control overrides the origin interpreted from your typed request.",
    );
  }

  const mediaType = isSuppressed(suppressed, "hard.mediaType")
    ? undefined
    : (draft.mediaType ?? parsed.mediaType);

  const genreMediaType = mediaType ?? "either";
  const validGenreKeys = new Set(
    getGenreOptions(genreMediaType).map((genre) => genre.key),
  );

  const manualPreferred = new Set(
    draft.preferredGenreKeys.filter((key) => validGenreKeys.has(key)),
  );
  const manualExcluded = new Set(
    draft.excludedGenreKeys.filter((key) => validGenreKeys.has(key)),
  );

  const preferredGenreKeys = new Set<string>();
  const excludedGenreKeys = new Set<string>();

  for (const key of parsed.preferredGenreKeys) {
    if (manualExcluded.has(key)) {
      conflicts.push(
        `Typed genre "${getGenreLabel(key)}" is overridden by your exclusion.`,
      );
      continue;
    }

    if (
      validGenreKeys.has(key) &&
      !isSuppressed(suppressed, `preferredGenre.${key}`)
    ) {
      preferredGenreKeys.add(key);
    }
  }

  for (const key of parsed.excludedGenreKeys) {
    if (manualPreferred.has(key)) {
      conflicts.push(
        `Typed exclusion "${getGenreLabel(key)}" is overridden by your preferred-genre selection.`,
      );
      continue;
    }

    if (
      validGenreKeys.has(key) &&
      !isSuppressed(suppressed, `excludedGenre.${key}`)
    ) {
      excludedGenreKeys.add(key);
    }
  }

  for (const key of manualPreferred) {
    if (!isSuppressed(suppressed, `preferredGenre.${key}`)) {
      preferredGenreKeys.add(key);
      excludedGenreKeys.delete(key);
    }
  }

  for (const key of manualExcluded) {
    if (!isSuppressed(suppressed, `excludedGenre.${key}`)) {
      excludedGenreKeys.add(key);
      preferredGenreKeys.delete(key);
    }
  }

  const maximumRuntimeMinutes = isSuppressed(suppressed, "hard.runtime")
    ? undefined
    : draft.maximumRuntimeMinutes === "any"
      ? undefined
      : (draft.maximumRuntimeMinutes ?? parsed.maximumRuntimeMinutes);

  const mood = isSuppressed(suppressed, "soft.mood")
    ? undefined
    : (draft.mood ?? parsed.mood);

  const companion = isSuppressed(suppressed, "soft.companion")
    ? undefined
    : (draft.companion ?? parsed.companion);

  const freshnessYearCandidate = isSuppressed(suppressed, "soft.freshness")
    ? undefined
    : (draft.freshnessYear ?? parsed.freshnessYear);

  const currentYear = new Date().getFullYear();

  const freshnessYear =
    freshnessYearCandidate !== undefined &&
    Number.isInteger(freshnessYearCandidate) &&
    freshnessYearCandidate >= 1870 &&
    freshnessYearCandidate <= currentYear
      ? freshnessYearCandidate
      : undefined;

  const contentLanguage = isSuppressed(suppressed, "soft.language")
    ? undefined
    : (draft.contentLanguage ?? parsed.contentLanguage);

  const originCountry = isSuppressed(suppressed, "soft.origin")
    ? undefined
    : (draft.originCountry ?? parsed.originCountry);

  const requiredProviderIds =
    draft.watchRegion === "US"
      ? draft.requiredProviderIds.filter(
          (id) => !isSuppressed(suppressed, `hard.provider.${id}`),
        )
      : [];

  const resolved: ResolvedPreferences = {
    ...(mediaType === undefined ? {} : { mediaType }),
    ...(mood === undefined ? {} : { mood }),
    ...(maximumRuntimeMinutes === undefined ? {} : { maximumRuntimeMinutes }),
    preferredGenreKeys: [...preferredGenreKeys],
    excludedGenreKeys: [...excludedGenreKeys],
    ...(companion === undefined ? {} : { companion }),
    ...(freshnessYear === undefined ? {} : { freshnessYear }),
    ...(contentLanguage === undefined ? {} : { contentLanguage }),
    ...(originCountry === undefined ? {} : { originCountry }),
    watchRegion: draft.watchRegion,
    requiredProviderIds,
  };

  const preferredGenreIds = genreKeysToIds(
    resolved.preferredGenreKeys,
    genreMediaType,
  );

  const excludedGenreIds = genreKeysToIds(
    resolved.excludedGenreKeys,
    genreMediaType,
  );

  const hardRestrictions = {
    ...(resolved.mediaType === undefined
      ? {}
      : { mediaType: resolved.mediaType }),
    ...(excludedGenreIds.length === 0 ? {} : { excludedGenreIds }),
    ...(resolved.maximumRuntimeMinutes === undefined
      ? {}
      : {
          maximumRuntimeMinutes: resolved.maximumRuntimeMinutes,
        }),
    ...(resolved.requiredProviderIds.length === 0
      ? {}
      : {
          requiredProviderIds: resolved.requiredProviderIds,
        }),
  };

  const softPreferences = {
    ...(resolved.mood === undefined ? {} : { mood: resolved.mood }),
    ...(preferredGenreIds.length === 0 ? {} : { preferredGenreIds }),
    ...(resolved.contentLanguage === undefined
      ? {}
      : {
          contentLanguage: resolved.contentLanguage,
        }),
    ...(resolved.originCountry === undefined
      ? {}
      : {
          originCountry: resolved.originCountry,
        }),
    ...(resolved.freshnessYear === undefined
      ? {}
      : {
          freshness: {
            releasedSinceYear: resolved.freshnessYear,
          },
        }),
  };

  const candidateRequest = {
    ...(Object.keys(hardRestrictions).length === 0 ? {} : { hardRestrictions }),
    ...(Object.keys(softPreferences).length === 0 ? {} : { softPreferences }),
    watchRegion: resolved.watchRegion,
  };

  const request = recommendationRequestSchema.parse(
    candidateRequest,
  ) as RecommendationRequest;

  return {
    request,
    resolved,
    unsupportedText: parsed.unsupportedText,
    conflicts,
    selectivity: calculateSelectivity(resolved),
  };
}
