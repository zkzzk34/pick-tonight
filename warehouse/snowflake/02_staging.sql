-- =============================================================================
-- 02_staging.sql
-- Typed, flattened views over RAW. No business logic lives here: these views
-- only cast types, rename fields to snake_case, and flatten arrays, so every
-- later model reads clean columns instead of raw JSON paths.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.STAGING;
ALTER SESSION SET QUERY_TAG = 'picktonight:staging';

-- One row per normalized TMDB title. title_key is the app's own identity:
-- TMDB IDs are only unique within a media type, so movie 10 and tv 10 differ.
CREATE OR REPLACE VIEW STG_TITLES AS
SELECT
  raw:record:mediaType::STRING || ':' || raw:record:id::STRING  AS title_key,
  raw:record:id::NUMBER                                         AS tmdb_id,
  raw:record:mediaType::STRING                                  AS media_type,
  raw:record:title::STRING                                      AS title,
  raw:record:originalTitle::STRING                              AS original_title,
  raw:record:overview::STRING                                   AS overview,
  TRY_TO_DATE(raw:record:releaseDate::STRING)                   AS release_date,
  YEAR(TRY_TO_DATE(raw:record:releaseDate::STRING))             AS release_year,
  raw:record:originalLanguage::STRING                           AS original_language,
  raw:record:genreIds                                           AS genre_ids,
  raw:record:posterPath::STRING                                 AS poster_path,
  raw:record:popularity::FLOAT                                  AS popularity,
  raw:record:voteAverage::FLOAT                                 AS vote_average,
  raw:record:voteCount::NUMBER                                  AS vote_count,
  raw:record:adult::BOOLEAN                                     AS is_adult,
  raw:source_rank::NUMBER                                       AS source_rank,
  raw:source_page::NUMBER                                       AS source_page,
  raw:extracted_at::TIMESTAMP_TZ                                AS extracted_at,
  source_file,
  source_row,
  loaded_at
FROM PICKTONIGHT.RAW.TMDB_TITLES;

-- One row per (title, genre id), from the title's genreIds array.
CREATE OR REPLACE VIEW STG_TITLE_GENRES AS
SELECT
  t.title_key,
  t.media_type,
  g.value::NUMBER AS genre_id,
  g.index         AS genre_position
FROM STG_TITLES AS t,
  LATERAL FLATTEN(input => t.genre_ids) AS g;

-- TMDB genre reference data. Genre IDs are scoped to a media type.
CREATE OR REPLACE VIEW STG_GENRES AS
SELECT
  raw:media_type::STRING  AS media_type,
  raw:genre_id::NUMBER    AS genre_id,
  raw:genre_name::STRING  AS genre_name,
  raw:extracted_at::TIMESTAMP_TZ AS extracted_at
FROM PICKTONIGHT.RAW.TMDB_GENRES;

-- The app's rule-based mood mapping, one row per (mood, genre, media type).
CREATE OR REPLACE VIEW STG_MOOD_RULES AS
SELECT
  r.raw:mood_mapping_version::STRING AS mood_mapping_version,
  r.raw:mood::STRING                 AS mood,
  r.raw:intent::STRING               AS mood_intent,
  r.raw:signal_kind::STRING          AS signal_kind,
  r.raw:genre_id::NUMBER             AS genre_id,
  r.raw:genre_name::STRING           AS genre_name,
  m.value::STRING                    AS media_type
FROM PICKTONIGHT.RAW.MOOD_GENRE_RULES AS r,
  LATERAL FLATTEN(input => r.raw:media_types) AS m;

-- Analytics events with taxonomy v3 properties pulled into typed columns.
-- data_origin comes from the file name, so synthetic rows can always be
-- separated from the real internal-traffic export.
CREATE OR REPLACE VIEW STG_EVENTS AS
WITH parsed AS (
  SELECT
    *,
    TRY_PARSE_JSON(properties_text)              AS properties,
    -- PostHog exports '2026-09-21 20:17:59.906000+00:00'; the synthetic file
    -- uses ISO 8601 with a Z. Try automatic detection, then PostHog's format.
    COALESCE(
      TRY_TO_TIMESTAMP_TZ(event_timestamp_text),
      TRY_TO_TIMESTAMP_TZ(event_timestamp_text, 'YYYY-MM-DD HH24:MI:SS.FF6TZH:TZM')
    )                                            AS event_at
  FROM PICKTONIGHT.RAW.EVENTS
)
SELECT
  event_uuid,
  event_name,
  event_at,
  TO_DATE(event_at)                                AS event_date,
  distinct_id,
  IFF(CONTAINS(LOWER(source_file), 'synthetic'), 'synthetic', 'posthog_internal')
                                                   AS data_origin,
  properties:taxonomy_version::NUMBER              AS taxonomy_version,
  properties:analytics_environment::STRING         AS analytics_environment,
  properties:traffic_class::STRING                 AS traffic_class,
  properties:session_id::STRING                    AS session_id,
  properties:recommendation_session_id::STRING     AS recommendation_session_id,
  properties:algorithm_version::STRING             AS algorithm_version,
  properties:recommendation_item_id::STRING        AS recommendation_item_id,
  properties:media_type::STRING                    AS media_type,
  properties:position::NUMBER                      AS position,
  properties:batch_sequence::NUMBER                AS batch_sequence,
  properties:mood_code::STRING                     AS mood_code,
  properties:media_type_code::STRING               AS media_type_code,
  properties:companion_code::STRING                AS companion_code,
  properties:used_typed_input::BOOLEAN             AS used_typed_input,
  properties:required_restriction_count::NUMBER    AS required_restriction_count,
  properties:rejection_reason::STRING              AS rejection_reason,
  properties:feedback_reason::STRING               AS feedback_reason,
  properties:error_kind::STRING                    AS error_kind,
  properties:candidate_age_code::STRING            AS candidate_age_code,
  properties:rating_confidence_code::STRING        AS rating_confidence_code,
  properties,
  properties_text,
  event_timestamp_text,
  source_file,
  source_row,
  loaded_at
FROM parsed;

-- Check: row counts per view.
SELECT 'STG_TITLES' AS view_name, COUNT(*) AS row_count FROM STG_TITLES
UNION ALL SELECT 'STG_TITLE_GENRES', COUNT(*) FROM STG_TITLE_GENRES
UNION ALL SELECT 'STG_GENRES', COUNT(*) FROM STG_GENRES
UNION ALL SELECT 'STG_MOOD_RULES', COUNT(*) FROM STG_MOOD_RULES
UNION ALL SELECT 'STG_EVENTS', COUNT(*) FROM STG_EVENTS;
