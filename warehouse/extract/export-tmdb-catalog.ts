/**
 * Export a PickTonight-normalized TMDB catalog snapshot for the Snowflake
 * warehouse.
 *
 * Pipeline role: this is the extract step. It reuses the app's own server-side
 * TMDB client and strict MediaSummary normalization, so the warehouse receives
 * exactly the record shape the recommendation engine already trusts. Records
 * that fail the contract are counted and skipped, never repaired by guessing.
 *
 * Outputs are newline-delimited JSON files (one record per line) that
 * Snowflake loads with COPY INTO:
 *   - tmdb_titles.ndjson       one normalized movie or TV title per line
 *   - tmdb_genres.ndjson       TMDB genre reference data per media type
 *   - mood_genre_rules.ndjson  the app's rule-based mood mapping, flattened
 *   - extract-report.json      counts used as data quality evidence
 *
 * Everything is written to warehouse/data/, which is gitignored. TMDB data is
 * never committed.
 *
 * Usage from the repository root:
 *   npm run warehouse:export-catalog
 *   npm run warehouse:export-catalog -- --pages=125
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { MediaSummary } from "../../src/shared/media-contracts.ts";
import {
  MOOD_MAPPING_CONFIGURATION,
  MOOD_MAPPING_VERSION,
} from "../../src/server/mood-mapping.ts";
import { fetchTmdbJson } from "../../src/server/tmdb-discovery-client.ts";
import {
  normalizeTmdbMovieResult,
  normalizeTmdbTvResult,
  TmdbNormalizationError,
} from "../../src/server/tmdb-normalization.ts";
import { normalizeTmdbGenres } from "../../src/server/tmdb-reference-normalization.ts";

type MediaType = MediaSummary["mediaType"];

/** 50 pages x 20 results gives about 1,000 titles per media type. */
export const DEFAULT_PAGES_PER_MEDIA_TYPE = 50;

/** TMDB discover endpoints never serve pages beyond 500. */
const MAX_TMDB_DISCOVER_PAGE = 500;

/**
 * A vote floor keeps the snapshot to titles people actually rate, which also
 * means most records carry a usable overview for the AI steps downstream.
 */
const MINIMUM_VOTE_COUNT = "100";

/** A short pause between requests keeps the run polite to TMDB. */
const DEFAULT_REQUEST_PAUSE_MS = 60;

/** Longer than the app default because this is a batch job, not a live page. */
const BATCH_REQUEST_TIMEOUT_MS = 15_000;

const MEDIA_TYPES: readonly MediaType[] = ["movie", "tv"];

const DISCOVER_PATHS = {
  movie: "/discover/movie",
  tv: "/discover/tv",
} as const satisfies Record<MediaType, string>;

const GENRE_PATHS = {
  movie: "/genre/movie/list",
  tv: "/genre/tv/list",
} as const satisfies Record<MediaType, string>;

export const OUTPUT_FILE_NAMES = {
  titles: "tmdb_titles.ndjson",
  genres: "tmdb_genres.ndjson",
  moodRules: "mood_genre_rules.ndjson",
  report: "extract-report.json",
} as const;

export type FetchJson = (
  pathname: string,
  searchParameters: Readonly<Record<string, string>>,
) => Promise<unknown>;

/** One line of tmdb_titles.ndjson: the normalized record plus lineage. */
export interface TitleLine {
  readonly extracted_at: string;
  readonly source_path: string;
  readonly source_page: number;
  /** One-based popularity rank within its media type for this snapshot. */
  readonly source_rank: number;
  readonly record: MediaSummary;
}

export interface GenreLine {
  readonly extracted_at: string;
  readonly media_type: MediaType;
  readonly genre_id: number;
  readonly genre_name: string;
}

/** One rule signal from MOOD_MAPPING_CONFIGURATION, flattened for SQL joins. */
export interface MoodRuleLine {
  readonly mood_mapping_version: typeof MOOD_MAPPING_VERSION;
  readonly mood: string;
  readonly intent: string;
  readonly signal_kind: "genre" | "discovery";
  readonly genre_id: number | null;
  readonly genre_name: string | null;
  readonly media_types: readonly MediaType[];
}

export interface MediaTypeStats {
  pages_requested: number;
  results_received: number;
  normalized: number;
  rejected: number;
  duplicates_skipped: number;
  written: number;
}

/** Position only: rejected records are counted without copying their content. */
export interface RejectedRecord {
  readonly media_type: MediaType;
  readonly page: number;
  readonly position_on_page: number;
}

export interface ExtractReport {
  readonly extracted_at: string;
  readonly pages_per_media_type: number;
  readonly minimum_vote_count: number;
  readonly mood_mapping_version: typeof MOOD_MAPPING_VERSION;
  readonly by_media_type: Readonly<Record<MediaType, MediaTypeStats>>;
  readonly genres_written: number;
  readonly mood_rules_written: number;
  readonly rejected_records: readonly RejectedRecord[];
}

export interface CatalogExport {
  readonly titles: readonly TitleLine[];
  readonly genres: readonly GenreLine[];
  readonly moodRules: readonly MoodRuleLine[];
  readonly report: ExtractReport;
}

export interface ExportCatalogOptions {
  readonly pagesPerMediaType?: number;
  readonly fetchJson?: FetchJson;
  readonly now?: () => Date;
  readonly requestPauseMs?: number;
}

export function discoverParameters(
  mediaType: MediaType,
  page: number,
): Record<string, string> {
  const parameters: Record<string, string> = {
    include_adult: "false",
    language: "en-US",
    page: String(page),
    sort_by: "popularity.desc",
    "vote_count.gte": MINIMUM_VOTE_COUNT,
  };

  // Same media-specific switches the live discovery requests use.
  if (mediaType === "movie") {
    parameters.include_video = "false";
  } else {
    parameters.include_null_first_air_dates = "false";
  }

  return parameters;
}

function normalizeResult(mediaType: MediaType, value: unknown): MediaSummary {
  return mediaType === "movie"
    ? normalizeTmdbMovieResult(value)
    : normalizeTmdbTvResult(value);
}

function resultsFromPayload(payload: unknown): unknown[] {
  const results =
    typeof payload === "object" && payload !== null
      ? (payload as { results?: unknown }).results
      : undefined;

  // A page without a results array means TMDB changed or failed; stop loudly
  // instead of writing a silently partial snapshot.
  if (!Array.isArray(results)) {
    throw new Error("A TMDB discover page did not contain a results array.");
  }

  return results;
}

/** Flatten the app's mood mapping so SQL can join it to title genres. */
export function moodRuleLines(): MoodRuleLine[] {
  const lines: MoodRuleLine[] = [];

  for (const [mood, mapping] of Object.entries(
    MOOD_MAPPING_CONFIGURATION.mappings,
  )) {
    for (const signal of mapping.signals) {
      lines.push(
        signal.kind === "genre"
          ? {
              mood_mapping_version: MOOD_MAPPING_VERSION,
              mood,
              intent: mapping.intent,
              signal_kind: "genre",
              genre_id: signal.genreId,
              genre_name: signal.genreName,
              media_types: [...signal.mediaTypes],
            }
          : {
              mood_mapping_version: MOOD_MAPPING_VERSION,
              mood,
              intent: mapping.intent,
              signal_kind: "discovery",
              genre_id: null,
              genre_name: null,
              media_types: [...MEDIA_TYPES],
            },
      );
    }
  }

  return lines;
}

function emptyStats(): MediaTypeStats {
  return {
    pages_requested: 0,
    results_received: 0,
    normalized: 0,
    rejected: 0,
    duplicates_skipped: 0,
    written: 0,
  };
}

function defaultFetchJson(
  pathname: string,
  searchParameters: Readonly<Record<string, string>>,
): Promise<unknown> {
  // Token comes from TMDB_API_READ_TOKEN in .env, exactly like the API server.
  return fetchTmdbJson(pathname, searchParameters, {
    timeoutMs: BATCH_REQUEST_TIMEOUT_MS,
  });
}

export async function exportCatalog({
  pagesPerMediaType = DEFAULT_PAGES_PER_MEDIA_TYPE,
  fetchJson = defaultFetchJson,
  now = () => new Date(),
  requestPauseMs = DEFAULT_REQUEST_PAUSE_MS,
}: ExportCatalogOptions = {}): Promise<CatalogExport> {
  if (
    !Number.isInteger(pagesPerMediaType) ||
    pagesPerMediaType < 1 ||
    pagesPerMediaType > MAX_TMDB_DISCOVER_PAGE
  ) {
    throw new Error(
      `pagesPerMediaType must be an integer from 1 to ${MAX_TMDB_DISCOVER_PAGE}.`,
    );
  }

  // One timestamp for the whole snapshot makes lineage queries simple.
  const extractedAt = now().toISOString();
  const titles: TitleLine[] = [];
  const genres: GenreLine[] = [];
  const rejectedRecords: RejectedRecord[] = [];
  const byMediaType: Record<MediaType, MediaTypeStats> = {
    movie: emptyStats(),
    tv: emptyStats(),
  };

  for (const mediaType of MEDIA_TYPES) {
    const stats = byMediaType[mediaType];
    // Popularity can shift while paging, so the same title may appear on two
    // pages. Keep the first (highest-ranked) appearance only.
    const seenIds = new Set<number>();

    for (let page = 1; page <= pagesPerMediaType; page += 1) {
      const payload = await fetchJson(
        DISCOVER_PATHS[mediaType],
        discoverParameters(mediaType, page),
      );
      stats.pages_requested += 1;

      const results = resultsFromPayload(payload);
      stats.results_received += results.length;

      results.forEach((value, index) => {
        let record: MediaSummary;

        try {
          record = normalizeResult(mediaType, value);
        } catch (error) {
          if (!(error instanceof TmdbNormalizationError)) {
            throw error;
          }

          stats.rejected += 1;
          rejectedRecords.push({
            media_type: mediaType,
            page,
            position_on_page: index + 1,
          });
          return;
        }

        stats.normalized += 1;

        if (seenIds.has(record.id)) {
          stats.duplicates_skipped += 1;
          return;
        }

        seenIds.add(record.id);
        stats.written += 1;
        titles.push({
          extracted_at: extractedAt,
          source_path: DISCOVER_PATHS[mediaType],
          source_page: page,
          source_rank: stats.written,
          record,
        });
      });

      // TMDB returns fewer pages than requested when the catalog runs out.
      const totalPages =
        typeof payload === "object" && payload !== null
          ? (payload as { total_pages?: unknown }).total_pages
          : undefined;

      if (typeof totalPages === "number" && page >= totalPages) {
        break;
      }

      if (requestPauseMs > 0) {
        await delay(requestPauseMs);
      }
    }

    const genrePayload = await fetchJson(GENRE_PATHS[mediaType], {
      language: "en-US",
    });

    for (const genre of normalizeTmdbGenres(genrePayload)) {
      genres.push({
        extracted_at: extractedAt,
        media_type: mediaType,
        genre_id: genre.id,
        genre_name: genre.name,
      });
    }
  }

  const moodRules = moodRuleLines();

  return {
    titles,
    genres,
    moodRules,
    report: {
      extracted_at: extractedAt,
      pages_per_media_type: pagesPerMediaType,
      minimum_vote_count: Number(MINIMUM_VOTE_COUNT),
      mood_mapping_version: MOOD_MAPPING_VERSION,
      by_media_type: byMediaType,
      genres_written: genres.length,
      mood_rules_written: moodRules.length,
      rejected_records: rejectedRecords,
    },
  };
}

export function toNdjson(lines: readonly unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

export async function writeCatalogExport(
  catalog: CatalogExport,
  outputDirectory: string,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, OUTPUT_FILE_NAMES.titles),
    toNdjson(catalog.titles),
  );
  await writeFile(
    path.join(outputDirectory, OUTPUT_FILE_NAMES.genres),
    toNdjson(catalog.genres),
  );
  await writeFile(
    path.join(outputDirectory, OUTPUT_FILE_NAMES.moodRules),
    toNdjson(catalog.moodRules),
  );
  await writeFile(
    path.join(outputDirectory, OUTPUT_FILE_NAMES.report),
    JSON.stringify(catalog.report, null, 2) + "\n",
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { pages: { type: "string" } },
  });
  const pagesPerMediaType =
    values.pages === undefined
      ? DEFAULT_PAGES_PER_MEDIA_TYPE
      : Number(values.pages);
  const outputDirectory = path.resolve("warehouse", "data");

  const catalog = await exportCatalog({ pagesPerMediaType });
  await writeCatalogExport(catalog, outputDirectory);

  const { movie, tv } = catalog.report.by_media_type;
  console.log(`Wrote ${catalog.titles.length} titles to ${outputDirectory}`);
  console.log(
    `movie: ${movie.written} written, ${movie.rejected} rejected, ${movie.duplicates_skipped} duplicates skipped`,
  );
  console.log(
    `tv: ${tv.written} written, ${tv.rejected} rejected, ${tv.duplicates_skipped} duplicates skipped`,
  );
  console.log(
    `${catalog.genres.length} genres, ${catalog.moodRules.length} mood rule signals`,
  );
}

// Run only when executed directly, so tests can import the functions above.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
