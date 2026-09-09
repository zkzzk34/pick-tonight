import type { MediaSummary } from "../shared/media-contracts.ts";
import {
  SUPPORTED_MOODS,
  type SupportedMood,
} from "../shared/recommendation-contracts.ts";

export const MOOD_MAPPING_VERSION = "recommendation-v1" as const;

type MoodSignalMediaType = MediaSummary["mediaType"];

export interface MoodGenreSignal {
  readonly kind: "genre";
  readonly mediaTypes: readonly MoodSignalMediaType[];
  readonly genreId: number;
  readonly genreName: string;
  readonly explanation: string;
}

export interface MoodDiscoverySignal {
  readonly kind: "discovery";
  readonly key: "cross-genre-variety";
  readonly explanation: string;
}

export type MoodSignal = MoodGenreSignal | MoodDiscoverySignal;

export interface MoodMapping {
  readonly intent: string;
  readonly signals: readonly MoodSignal[];
}

export interface MoodMappingConfiguration {
  readonly version: typeof MOOD_MAPPING_VERSION;
  readonly mappings: Readonly<Record<SupportedMood, MoodMapping>>;
}

function genreSignal(
  mediaTypes: readonly MoodSignalMediaType[],
  genreId: number,
  genreName: string,
  explanation: string,
): MoodGenreSignal {
  return { kind: "genre", mediaTypes, genreId, genreName, explanation };
}

function discoverySignal(explanation: string): MoodDiscoverySignal {
  return { kind: "discovery", key: "cross-genre-variety", explanation };
}

export const MOOD_MAPPING_CONFIGURATION = {
  version: MOOD_MAPPING_VERSION,
  mappings: {
    relaxed: {
      intent: "Favor gentler genre proxies without promising a calm tone.",
      signals: [
        genreSignal(
          ["movie", "tv"],
          16,
          "Animation",
          "Often supports imaginative, lower-pressure viewing.",
        ),
        genreSignal(
          ["movie", "tv"],
          10751,
          "Family",
          "Provides a broad proxy for accessible, familiar stories.",
        ),
        genreSignal(
          ["movie"],
          10402,
          "Music",
          "Can support an easygoing or uplifting viewing experience.",
        ),
      ],
    },
    laughing: {
      intent: "Favor titles whose catalog genre most directly signals humor.",
      signals: [
        genreSignal(
          ["movie", "tv"],
          35,
          "Comedy",
          "TMDB's clearest title-level humor signal.",
        ),
      ],
    },
    excited: {
      intent: "Favor high-energy action, adventure, and suspense proxies.",
      signals: [
        genreSignal(
          ["movie"],
          28,
          "Action",
          "Commonly signals physical energy and momentum.",
        ),
        genreSignal(
          ["movie"],
          12,
          "Adventure",
          "Commonly signals momentum and spectacle.",
        ),
        genreSignal(
          ["movie"],
          53,
          "Thriller",
          "Can signal sustained tension and urgency.",
        ),
        genreSignal(
          ["tv"],
          10759,
          "Action & Adventure",
          "TMDB's direct high-energy television category.",
        ),
      ],
    },
    thoughtful: {
      intent: "Favor reflective, factual, or idea-led genre proxies.",
      signals: [
        genreSignal(
          ["movie", "tv"],
          18,
          "Drama",
          "Can foreground character choices and emotional complexity.",
        ),
        genreSignal(
          ["movie", "tv"],
          99,
          "Documentary",
          "Can foreground real subjects and ideas.",
        ),
        genreSignal(
          ["movie"],
          36,
          "History",
          "Can provide context-rich subject matter.",
        ),
      ],
    },
    romantic: {
      intent: "Favor romance and the closest broad television proxy.",
      signals: [
        genreSignal(
          ["movie"],
          10749,
          "Romance",
          "TMDB's direct movie-level relationship signal.",
        ),
        genreSignal(
          ["tv"],
          18,
          "Drama",
          "TMDB has no television Romance genre, so this is a broad proxy only.",
        ),
      ],
    },
    spooked: {
      intent: "Favor horror, suspense, and mystery proxies.",
      signals: [
        genreSignal(
          ["movie"],
          27,
          "Horror",
          "TMDB's direct movie-level fear signal.",
        ),
        genreSignal(
          ["movie"],
          53,
          "Thriller",
          "Can provide suspense without guaranteeing horror.",
        ),
        genreSignal(
          ["movie", "tv"],
          9648,
          "Mystery",
          "Can support uncertainty and unsettling discovery.",
        ),
      ],
    },
    surprised: {
      intent: "Preserve broad discovery instead of forcing a genre preference.",
      signals: [
        discoverySignal(
          "A later scorer may reward cross-genre variety without overriding explicit preferences.",
        ),
      ],
    },
  },
} as const satisfies MoodMappingConfiguration;

const supportedMoodSet: ReadonlySet<string> = new Set(SUPPORTED_MOODS);

export function isSupportedMood(value: unknown): value is SupportedMood {
  return typeof value === "string" && supportedMoodSet.has(value);
}

export function getMoodMapping(value: unknown): MoodMapping | null {
  return isSupportedMood(value)
    ? MOOD_MAPPING_CONFIGURATION.mappings[value]
    : null;
}
