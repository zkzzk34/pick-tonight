-- =============================================================================
-- 01_load_raw.sql
-- Load uploaded extracts from the internal stage into RAW tables.
--
-- RAW keeps each record exactly as it arrived, plus lineage columns:
--   source_file  stage path of the file the row came from
--   source_row   line number inside that file
--   loaded_at    when this load ran
--
-- Each load is a full snapshot refresh: TRUNCATE, then COPY INTO with
-- FORCE = TRUE so a rerun reloads files Snowflake has already seen.
-- PATTERN matches each file whether or not the upload compressed it.
--
-- Before running: upload the files in warehouse/data/ to
-- PICKTONIGHT.RAW.PICKTONIGHT_STAGE (see warehouse/README.md, step 5).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.RAW;
ALTER SESSION SET QUERY_TAG = 'picktonight:load';

-- What is on the stage right now?
LIST @PICKTONIGHT_STAGE;

-- Tables ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS TMDB_TITLES (
  raw          VARIANT       COMMENT 'One export line: lineage fields plus the normalized MediaSummary record',
  source_file  STRING,
  source_row   NUMBER,
  loaded_at    TIMESTAMP_LTZ
);

CREATE TABLE IF NOT EXISTS TMDB_GENRES (
  raw          VARIANT,
  source_file  STRING,
  source_row   NUMBER,
  loaded_at    TIMESTAMP_LTZ
);

CREATE TABLE IF NOT EXISTS MOOD_GENRE_RULES (
  raw          VARIANT       COMMENT 'One flattened signal from the app mood mapping',
  source_file  STRING,
  source_row   NUMBER,
  loaded_at    TIMESTAMP_LTZ
);

-- Event columns stay as text in RAW. STAGING parses them, so a bad timestamp
-- or malformed JSON becomes a data quality finding instead of a failed load.
CREATE TABLE IF NOT EXISTS EVENTS (
  event_uuid            STRING,
  event_name            STRING,
  event_timestamp_text  STRING,
  distinct_id           STRING,
  properties_text       STRING,
  source_file           STRING,
  source_row            NUMBER,
  loaded_at             TIMESTAMP_LTZ
);

-- Optional dry run: shows parse errors in the titles file without loading.
-- COPY INTO TMDB_TITLES FROM @PICKTONIGHT_STAGE
--   PATTERN = '.*tmdb_titles[.]ndjson([.]gz)?'
--   FILE_FORMAT = (FORMAT_NAME = FF_NDJSON)
--   VALIDATION_MODE = RETURN_ERRORS;

-- TMDB titles -------------------------------------------------------------------
TRUNCATE TABLE TMDB_TITLES;
COPY INTO TMDB_TITLES (raw, source_file, source_row, loaded_at)
FROM (
  SELECT $1, METADATA$FILENAME, METADATA$FILE_ROW_NUMBER, CURRENT_TIMESTAMP()
  FROM @PICKTONIGHT_STAGE
)
PATTERN = '.*tmdb_titles[.]ndjson([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = FF_NDJSON)
ON_ERROR = ABORT_STATEMENT
FORCE = TRUE;

-- TMDB genres -------------------------------------------------------------------
TRUNCATE TABLE TMDB_GENRES;
COPY INTO TMDB_GENRES (raw, source_file, source_row, loaded_at)
FROM (
  SELECT $1, METADATA$FILENAME, METADATA$FILE_ROW_NUMBER, CURRENT_TIMESTAMP()
  FROM @PICKTONIGHT_STAGE
)
PATTERN = '.*tmdb_genres[.]ndjson([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = FF_NDJSON)
ON_ERROR = ABORT_STATEMENT
FORCE = TRUE;

-- Mood mapping rules -----------------------------------------------------------
TRUNCATE TABLE MOOD_GENRE_RULES;
COPY INTO MOOD_GENRE_RULES (raw, source_file, source_row, loaded_at)
FROM (
  SELECT $1, METADATA$FILENAME, METADATA$FILE_ROW_NUMBER, CURRENT_TIMESTAMP()
  FROM @PICKTONIGHT_STAGE
)
PATTERN = '.*mood_genre_rules[.]ndjson([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = FF_NDJSON)
ON_ERROR = ABORT_STATEMENT
FORCE = TRUE;

-- Events: synthetic file plus the internal PostHog export --------------------------
-- Both files share one layout. The pattern matches synthetic_events_v3.csv and
-- posthog_internal_events.csv.
TRUNCATE TABLE EVENTS;
COPY INTO EVENTS (
  event_uuid, event_name, event_timestamp_text, distinct_id, properties_text,
  source_file, source_row, loaded_at
)
FROM (
  SELECT $1, $2, $3, $4, $5,
         METADATA$FILENAME, METADATA$FILE_ROW_NUMBER, CURRENT_TIMESTAMP()
  FROM @PICKTONIGHT_STAGE
)
PATTERN = '.*(synthetic_events_v3|posthog_internal_events)[.]csv([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = FF_EVENTS_CSV)
ON_ERROR = ABORT_STATEMENT
FORCE = TRUE;

-- Check: row counts per table and per source file.
SELECT 'TMDB_TITLES' AS table_name, source_file, COUNT(*) AS row_count FROM TMDB_TITLES GROUP BY ALL
UNION ALL
SELECT 'TMDB_GENRES', source_file, COUNT(*) FROM TMDB_GENRES GROUP BY ALL
UNION ALL
SELECT 'MOOD_GENRE_RULES', source_file, COUNT(*) FROM MOOD_GENRE_RULES GROUP BY ALL
UNION ALL
SELECT 'EVENTS', source_file, COUNT(*) FROM EVENTS GROUP BY ALL
ORDER BY table_name, source_file;
