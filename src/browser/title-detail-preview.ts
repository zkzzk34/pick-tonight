import type { TitleDetailData } from "./title-detail-model";

const details = [
  {
    mediaKey: "preview:movie-a",
    title: "Preview movie A",
    year: 2025,
    mediaType: "movie",
    overview:
      "Sample overview showing the richer title-details decision surface.",
    posterUrl: null,
    genres: ["Comedy", "Adventure"],
    runtime: { kind: "movie", minutes: 101 },
    rating: {
      average: 7.6,
      voteCount: 840,
      confidence: "high",
    },
    freshness: {
      label: "Released in 2025",
      basis: "release-date",
    },
    watchRegion: "US",
    providerAvailability: {
      source: "justwatch",
      watchRegion: "US",
      tmdbUrl: null,
      streaming: ["Netflix", "Max"],
      free: [],
      ads: [],
      rent: ["Apple TV"],
      buy: ["Apple TV"],
    },
    trailerUrl: null,
    fitExplanation: {
      summary: "A comedy pick that stays within the reviewed time limit.",
      reasons: [
        {
          kind: "verified",
          label: "Runtime verified",
          text: "The candidate satisfied the submitted runtime restriction.",
        },
        {
          kind: "soft-match",
          label: "Genre match",
          text: "Comedy matches a reviewed genre preference.",
        },
      ],
    },
  },
  {
    mediaKey: "preview:tv-b",
    title: "Preview television B",
    year: 2024,
    mediaType: "tv",
    overview: "Sample television overview for the local title-details preview.",
    posterUrl: null,
    genres: ["Drama"],
    runtime: { kind: "episode", minutes: 47 },
    rating: {
      average: 7.2,
      voteCount: 18,
      confidence: "low",
    },
    freshness: {
      label: "First aired in 2024",
      basis: "first-air-date",
    },
    watchRegion: "US",
    providerAvailability: null,
    trailerUrl: null,
    fitExplanation: {
      summary:
        "A television option that keeps the current reviewed request intact.",
      reasons: [
        {
          kind: "soft-match",
          label: "Format match",
          text: "The title remains eligible for the reviewed media choice.",
        },
      ],
    },
  },
  {
    mediaKey: "preview:movie-c",
    title: "Preview movie C",
    year: null,
    mediaType: "movie",
    overview: null,
    posterUrl: null,
    genres: [],
    runtime: null,
    rating: {
      average: 0,
      voteCount: 0,
      confidence: "none",
    },
    freshness: null,
    watchRegion: "US",
    providerAvailability: null,
    trailerUrl: null,
    fitExplanation: null,
  },
  {
    mediaKey: "preview:movie-d",
    title: "Preview movie D",
    year: 2023,
    mediaType: "movie",
    overview: "Sample replacement-title overview for the local preview.",
    posterUrl: null,
    genres: ["Mystery"],
    runtime: { kind: "movie", minutes: 96 },
    rating: {
      average: 7.4,
      voteCount: 132,
      confidence: "established",
    },
    freshness: {
      label: "Released in 2023",
      basis: "release-date",
    },
    watchRegion: "US",
    providerAvailability: {
      source: "justwatch",
      watchRegion: "US",
      tmdbUrl: null,
      streaming: ["Prime Video"],
      free: [],
      ads: [],
      rent: [],
      buy: [],
    },
    trailerUrl: null,
    fitExplanation: {
      summary:
        "A replacement that keeps the active request and the other picks stable.",
      reasons: [
        {
          kind: "verified",
          label: "Runtime verified",
          text: "The replacement remains within the submitted time restriction.",
        },
      ],
    },
  },
] as const satisfies readonly TitleDetailData[];

const DETAILS_BY_MEDIA_KEY = new Map<string, TitleDetailData>(
  details.map((detail): [string, TitleDetailData] => [detail.mediaKey, detail]),
);

export function getPreviewTitleDetail(
  mediaKey: string,
): TitleDetailData | null {
  return DETAILS_BY_MEDIA_KEY.get(mediaKey) ?? null;
}

export const PREVIEW_TITLE_DETAILS = details;
