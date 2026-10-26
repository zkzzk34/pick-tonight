-- =============================================================================
-- 03_marts.sql
-- Modeled tables for analytics and AI.
--
--   DIM_TITLE                     one row per title, with genre names and the
--                                 search_document text the ML steps embed
--   BRIDGE_TITLE_GENRE            title to genre, with genre names resolved
--   TITLE_RULE_MOODS              moods the app's rule mapping gives each title
--   FCT_EVENTS                    one row per analytics event
--   FCT_RECOMMENDATION_JOURNEYS   one row per recommendation journey
--   AGG_PICKER_FUNNEL_DAILY       daily funnel counts and step conversion
--   AGG_MOOD_OUTCOMES             journey outcomes by requested mood
--
-- Tables are rebuilt with CREATE OR REPLACE. Rebuilding FCT_EVENTS drops its
-- masking policies, so rerun 07_governance.sql after rerunning this file.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.MARTS;
ALTER SESSION SET QUERY_TAG = 'picktonight:marts';

-- Titles ----------------------------------------------------------------------
CREATE OR REPLACE TABLE BRIDGE_TITLE_GENRE AS
SELECT
  tg.title_key,
  tg.media_type,
  tg.genre_id,
  g.genre_name,
  tg.genre_position
FROM PICKTONIGHT.STAGING.STG_TITLE_GENRES AS tg
LEFT JOIN PICKTONIGHT.STAGING.STG_GENRES AS g
  ON g.media_type = tg.media_type
 AND g.genre_id = tg.genre_id;

CREATE OR REPLACE TABLE DIM_TITLE AS
WITH genre_lists AS (
  SELECT
    title_key,
    ARRAY_AGG(genre_name) WITHIN GROUP (ORDER BY genre_position) AS genre_names
  FROM BRIDGE_TITLE_GENRE
  WHERE genre_name IS NOT NULL
  GROUP BY title_key
)
SELECT
  t.title_key,
  t.tmdb_id,
  t.media_type,
  t.title,
  t.original_title,
  t.overview,
  t.release_date,
  t.release_year,
  t.original_language,
  COALESCE(gl.genre_names, ARRAY_CONSTRUCT())          AS genre_names,
  ARRAY_TO_STRING(COALESCE(gl.genre_names, ARRAY_CONSTRUCT()), ', ')
                                                       AS genre_names_text,
  t.popularity,
  t.vote_average,
  t.vote_count,
  -- Mirrors RATING_CONFIDENCE_CONFIG in src/server/recommendation-engine.ts:
  -- up to 24 votes is limited, up to 99 is medium, a title released in the
  -- last 180 days is strong from 100 votes, older titles need 500.
  CASE
    WHEN COALESCE(t.vote_count, 0) <= 24 THEN 'limited'
    WHEN t.vote_count <= 99 THEN 'medium'
    WHEN DATEDIFF('day', t.release_date, TO_DATE(t.extracted_at)) BETWEEN 0 AND 180 THEN 'strong'
    WHEN t.vote_count < 500 THEN 'medium'
    ELSE 'strong'
  END                                                  AS rating_confidence,
  t.source_rank                                        AS popularity_rank,
  t.title
    || ' (' || IFF(t.media_type = 'movie', 'movie', 'TV series')
    || COALESCE(', ' || t.release_year, '') || '). '
    || COALESCE('Genres: ' || NULLIF(genre_names_text, '') || '. ', '')
    || COALESCE(t.overview, '')                        AS search_document,
  t.extracted_at,
  t.loaded_at
FROM PICKTONIGHT.STAGING.STG_TITLES AS t
LEFT JOIN genre_lists AS gl
  ON gl.title_key = t.title_key
-- The export already removes duplicates; this keeps the key unique even if the
-- same file were staged twice.
QUALIFY ROW_NUMBER() OVER (PARTITION BY t.title_key ORDER BY t.source_rank) = 1;

-- Snowflake does not enforce primary keys, but declaring one documents the
-- grain. 04_data_quality.sql is what actually checks uniqueness.
ALTER TABLE DIM_TITLE ADD CONSTRAINT PK_DIM_TITLE PRIMARY KEY (title_key);
COMMENT ON COLUMN DIM_TITLE.rating_confidence IS 'limited, medium, or strong, using the app rating confidence rules';
COMMENT ON COLUMN DIM_TITLE.popularity_rank IS 'Rank within media type in this snapshot';
COMMENT ON COLUMN DIM_TITLE.search_document IS 'Title, type, year, genres, and overview: the text the embedding model reads';

-- Moods from the app's rule mapping: a title gets a mood when any of its genres
-- is a genre signal for that mood and media type. "surprised" is a discovery
-- signal, not a genre rule, so it never appears here.
CREATE OR REPLACE TABLE TITLE_RULE_MOODS AS
SELECT
  b.title_key,
  r.mood,
  r.mood_mapping_version,
  ARRAY_AGG(DISTINCT r.genre_name) AS matched_genres
FROM BRIDGE_TITLE_GENRE AS b
JOIN PICKTONIGHT.STAGING.STG_MOOD_RULES AS r
  ON r.signal_kind = 'genre'
 AND r.genre_id = b.genre_id
 AND r.media_type = b.media_type
GROUP BY b.title_key, r.mood, r.mood_mapping_version;

-- Events ---------------------------------------------------------------------
CREATE OR REPLACE TABLE FCT_EVENTS AS
SELECT
  event_uuid,
  event_name,
  event_at,
  event_date,
  data_origin,
  distinct_id,
  session_id,
  recommendation_session_id,
  recommendation_item_id,
  algorithm_version,
  analytics_environment,
  traffic_class,
  media_type,
  position,
  batch_sequence,
  mood_code,
  media_type_code,
  companion_code,
  used_typed_input,
  required_restriction_count,
  rejection_reason,
  feedback_reason,
  error_kind,
  candidate_age_code,
  rating_confidence_code,
  properties,
  source_file,
  loaded_at
FROM PICKTONIGHT.STAGING.STG_EVENTS
-- Rows that fail parsing stay out of the fact table and show up in 04_data_quality.sql.
WHERE event_at IS NOT NULL
  AND properties IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY event_uuid ORDER BY loaded_at) = 1;

-- One row per recommendation journey: from context submission to a choice,
-- an empty result, an error, or leaving.
CREATE OR REPLACE TABLE FCT_RECOMMENDATION_JOURNEYS AS
SELECT
  recommendation_session_id,
  ANY_VALUE(data_origin)                                         AS data_origin,
  ANY_VALUE(algorithm_version)                                   AS algorithm_version,
  MIN(IFF(event_name = 'context_submitted', event_at, NULL))     AS submitted_at,
  MAX(IFF(event_name = 'context_submitted', mood_code, NULL))    AS mood_code,
  MAX(IFF(event_name = 'context_submitted', media_type_code, NULL)) AS media_type_code,
  MAX(IFF(event_name = 'context_submitted', companion_code, NULL))  AS companion_code,
  MAX(IFF(event_name = 'context_submitted', used_typed_input, NULL)) AS used_typed_input,
  COUNT_IF(event_name = 'recommendation_item_shown')             AS items_shown,
  COUNT_IF(event_name = 'recommendation_opened')                 AS items_opened,
  COUNT_IF(event_name = 'trailer_clicked')                       AS trailers_clicked,
  COUNT_IF(event_name = 'recommendation_saved')                  AS items_saved,
  COUNT_IF(event_name = 'recommendation_rejected')               AS items_rejected,
  COUNT_IF(event_name = 'recommendations_refreshed')             AS items_refreshed,
  COUNT_IF(event_name = 'recommendation_empty_shown') > 0        AS ended_empty,
  COUNT_IF(event_name = 'api_error_shown') > 0                   AS ended_with_error,
  MIN(IFF(event_name = 'watch_intent_confirmed', event_at, NULL)) AS chosen_at,
  chosen_at IS NOT NULL                                          AS chose_title,
  DATEDIFF('second', submitted_at, chosen_at)                    AS seconds_to_decision
FROM FCT_EVENTS
WHERE recommendation_session_id IS NOT NULL
GROUP BY recommendation_session_id;

-- Daily funnel: distinct page sessions reaching each step.
CREATE OR REPLACE TABLE AGG_PICKER_FUNNEL_DAILY AS
SELECT
  event_date,
  data_origin,
  COUNT(DISTINCT IFF(event_name = 'app_opened', session_id, NULL))                  AS sessions_opened,
  COUNT(DISTINCT IFF(event_name = 'picker_started', session_id, NULL))              AS sessions_started_picker,
  COUNT(DISTINCT IFF(event_name = 'context_submitted', session_id, NULL))           AS sessions_submitted,
  COUNT(DISTINCT IFF(event_name = 'recommendation_batch_viewed', session_id, NULL)) AS sessions_saw_picks,
  COUNT(DISTINCT IFF(event_name = 'watch_intent_confirmed', session_id, NULL))      AS sessions_chose,
  ROUND(DIV0(sessions_started_picker, sessions_opened), 3)                          AS start_rate,
  ROUND(DIV0(sessions_submitted, sessions_started_picker), 3)                       AS submit_rate,
  ROUND(DIV0(sessions_chose, sessions_saw_picks), 3)                                AS choose_rate
FROM FCT_EVENTS
GROUP BY event_date, data_origin;

-- Journey outcomes by requested mood.
CREATE OR REPLACE TABLE AGG_MOOD_OUTCOMES AS
SELECT
  data_origin,
  COALESCE(mood_code, 'none')                               AS mood_code,
  COUNT(*)                                                  AS journeys,
  ROUND(AVG(IFF(chose_title, 1, 0)), 3)                     AS choose_rate,
  ROUND(AVG(items_rejected), 2)                             AS avg_rejections,
  MEDIAN(seconds_to_decision)                               AS median_seconds_to_decision,
  ROUND(AVG(IFF(ended_empty, 1, 0)), 3)                     AS empty_rate
FROM FCT_RECOMMENDATION_JOURNEYS
GROUP BY ALL;

-- Check: row counts and a first look at the funnel.
SELECT 'DIM_TITLE' AS table_name, COUNT(*) AS row_count FROM DIM_TITLE
UNION ALL SELECT 'BRIDGE_TITLE_GENRE', COUNT(*) FROM BRIDGE_TITLE_GENRE
UNION ALL SELECT 'TITLE_RULE_MOODS', COUNT(*) FROM TITLE_RULE_MOODS
UNION ALL SELECT 'FCT_EVENTS', COUNT(*) FROM FCT_EVENTS
UNION ALL SELECT 'FCT_RECOMMENDATION_JOURNEYS', COUNT(*) FROM FCT_RECOMMENDATION_JOURNEYS
UNION ALL SELECT 'AGG_PICKER_FUNNEL_DAILY', COUNT(*) FROM AGG_PICKER_FUNNEL_DAILY
UNION ALL SELECT 'AGG_MOOD_OUTCOMES', COUNT(*) FROM AGG_MOOD_OUTCOMES;

SELECT
  data_origin,
  SUM(sessions_opened)          AS opened,
  SUM(sessions_started_picker)  AS started,
  SUM(sessions_submitted)       AS submitted,
  SUM(sessions_saw_picks)       AS saw_picks,
  SUM(sessions_chose)           AS chose
FROM AGG_PICKER_FUNNEL_DAILY
GROUP BY data_origin;
