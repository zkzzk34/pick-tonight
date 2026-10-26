import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverParameters,
  exportCatalog,
  moodRuleLines,
  toNdjson,
  type FetchJson,
} from "./export-tmdb-catalog.ts";

function movieResult(id: number, title: string): Record<string, unknown> {
  return {
    id,
    title,
    original_title: title,
    overview: `${title} overview.`,
    release_date: "2024-05-01",
    original_language: "en",
    genre_ids: [35],
    poster_path: "/poster.jpg",
    backdrop_path: null,
    popularity: 10,
    vote_average: 7.1,
    vote_count: 500,
    adult: false,
  };
}

function tvResult(id: number, name: string): Record<string, unknown> {
  return {
    id,
    name,
    original_name: name,
    overview: `${name} overview.`,
    first_air_date: "2023-01-10",
    original_language: "en",
    genre_ids: [18],
    poster_path: null,
    backdrop_path: null,
    popularity: 5,
    vote_average: 8,
    vote_count: 300,
    adult: false,
  };
}

/** A fake TMDB that serves two pages per media type and both genre lists. */
function fakeTmdb(): { fetchJson: FetchJson; calls: string[] } {
  const calls: string[] = [];
  const pages: Record<string, unknown> = {
    "/discover/movie:1": {
      total_pages: 2,
      results: [movieResult(1, "Alpha"), { id: "broken" }],
    },
    // Movie 1 shows up again on page 2 because popularity shifted.
    "/discover/movie:2": {
      total_pages: 2,
      results: [movieResult(2, "Bravo"), movieResult(1, "Alpha")],
    },
    "/discover/tv:1": { total_pages: 1, results: [tvResult(10, "Delta")] },
  };

  const fetchJson: FetchJson = async (pathname, parameters) => {
    calls.push(`${pathname}:${parameters.page ?? ""}`);

    if (pathname === "/genre/movie/list") {
      return { genres: [{ id: 35, name: "Comedy" }] };
    }

    if (pathname === "/genre/tv/list") {
      return { genres: [{ id: 18, name: "Drama" }] };
    }

    return pages[`${pathname}:${parameters.page}`];
  };

  return { fetchJson, calls };
}

test("discover parameters match the live app's safe defaults", () => {
  const movie = discoverParameters("movie", 3);
  assert.equal(movie.page, "3");
  assert.equal(movie.include_adult, "false");
  assert.equal(movie.include_video, "false");
  assert.equal(movie.sort_by, "popularity.desc");

  const tv = discoverParameters("tv", 1);
  assert.equal(tv.include_null_first_air_dates, "false");
  assert.equal(tv.include_video, undefined);
});

test("exports normalized titles, skips duplicates, and counts rejects", async () => {
  const { fetchJson, calls } = fakeTmdb();
  const catalog = await exportCatalog({
    pagesPerMediaType: 5,
    fetchJson,
    now: () => new Date("2026-10-26T15:00:00.000Z"),
    requestPauseMs: 0,
  });

  // Paging stops at total_pages instead of requesting all five pages.
  assert.deepEqual(calls, [
    "/discover/movie:1",
    "/discover/movie:2",
    "/genre/movie/list:",
    "/discover/tv:1",
    "/genre/tv/list:",
  ]);

  assert.deepEqual(
    catalog.titles.map((line) => [line.record.mediaType, line.record.id]),
    [
      ["movie", 1],
      ["movie", 2],
      ["tv", 10],
    ],
  );
  assert.deepEqual(
    catalog.titles.map((line) => line.source_rank),
    [1, 2, 1],
  );
  assert.equal(catalog.titles[0]?.extracted_at, "2026-10-26T15:00:00.000Z");
  assert.equal(catalog.titles[0]?.record.title, "Alpha");

  const movieStats = catalog.report.by_media_type.movie;
  assert.equal(movieStats.results_received, 4);
  assert.equal(movieStats.rejected, 1);
  assert.equal(movieStats.duplicates_skipped, 1);
  assert.equal(movieStats.written, 2);
  assert.deepEqual(catalog.report.rejected_records, [
    { media_type: "movie", page: 1, position_on_page: 2 },
  ]);

  assert.deepEqual(
    catalog.genres.map((line) => [line.media_type, line.genre_name]),
    [
      ["movie", "Comedy"],
      ["tv", "Drama"],
    ],
  );
});

test("a page without results stops the export", async () => {
  await assert.rejects(
    exportCatalog({
      pagesPerMediaType: 1,
      fetchJson: async () => ({ status_message: "nope" }),
      requestPauseMs: 0,
    }),
    /results array/,
  );
});

test("page counts outside TMDB's range are refused", async () => {
  await assert.rejects(exportCatalog({ pagesPerMediaType: 0 }), /from 1 to/);
  await assert.rejects(exportCatalog({ pagesPerMediaType: 501 }), /from 1 to/);
});

test("mood rules flatten every genre signal and keep discovery moods", () => {
  const lines = moodRuleLines();
  const laughing = lines.filter((line) => line.mood === "laughing");
  assert.deepEqual(
    laughing.map((line) => [line.genre_id, line.media_types]),
    [[35, ["movie", "tv"]]],
  );

  const surprised = lines.find((line) => line.mood === "surprised");
  assert.equal(surprised?.signal_kind, "discovery");
  assert.equal(surprised?.genre_id, null);
});

test("NDJSON output has one JSON object per line and a final newline", () => {
  const text = toNdjson([{ a: 1 }, { b: "two" }]);
  assert.equal(text, '{"a":1}\n{"b":"two"}\n');
});
