-- =============================================================================
-- 04_data_quality.sql
-- Data quality and privacy checks, saved as a results table.
--
-- Each check returns the number of failing rows. Severity decides the status:
--   error  any failing row means the data is not fit for the AI steps
--   warn   worth knowing, but expected in small numbers
--
-- The privacy check enforces the same property allowlist the app enforces in
-- the browser (docs/analytics-property-allowlist.md): if any event carries a
-- property outside the taxonomy, such as a title or TMDB ID, it fails.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.GOVERNANCE;
ALTER SESSION SET QUERY_TAG = 'picktonight:data-quality';

CREATE TABLE IF NOT EXISTS DQ_RESULTS (
  run_at        TIMESTAMP_LTZ,
  check_name    STRING,
  layer         STRING,
  severity      STRING,
  failed_rows   NUMBER,
  total_rows    NUMBER,
  status        STRING,
  description   STRING
);

INSERT INTO DQ_RESULTS
WITH
titles AS (SELECT * FROM PICKTONIGHT.STAGING.STG_TITLES),
events AS (SELECT * FROM PICKTONIGHT.STAGING.STG_EVENTS),
-- Every property name the taxonomy allows on any event, plus two PostHog SDK
-- transport fields: $process_person_profile (documented in
-- docs/analytics-property-allowlist.md) and $sent_at (the send timestamp the
-- SDK adds; the October 2026 export showed it on stored events). Neither is
-- product data. Any other $ property still fails the check.
allowed_properties AS (
  SELECT value::STRING AS property_name
  FROM TABLE(FLATTEN(input => ARRAY_CONSTRUCT(
    '$process_person_profile', '$sent_at',
    'taxonomy_version', 'ui_locale', 'analytics_environment', 'traffic_class',
    'session_id', 'response', 'step', 'reason', 'recommendation_session_id',
    'algorithm_version', 'used_typed_input', 'required_restriction_count',
    'soft_preference_count', 'media_type_code', 'mood_code', 'companion_code',
    'maximum_runtime_minutes', 'freshness_year', 'content_language_code',
    'origin_country_code', 'watch_region_code', 'batch_sequence',
    'recommendation_count', 'recommendation_item_id', 'media_type', 'position',
    'impression_sequence', 'candidate_age_code', 'rating_confidence_code',
    'provider_claim_status', 'repeat_status', 'persistence', 'rejection_reason',
    'feedback_reason', 'originating_action', 'error_kind'
  )))
),
event_property_names AS (
  SELECT e.event_uuid, k.value::STRING AS property_name
  FROM events AS e,
    LATERAL FLATTEN(input => OBJECT_KEYS(e.properties)) AS k
  WHERE e.properties IS NOT NULL
),
known_events AS (
  SELECT value::STRING AS event_name
  FROM TABLE(FLATTEN(input => ARRAY_CONSTRUCT(
    'app_opened', 'consent_responded', 'picker_started', 'picker_step_completed',
    'picker_abandoned', 'context_submitted', 'recommendation_batch_viewed',
    'recommendation_empty_shown', 'recommendation_item_shown',
    'recommendation_opened', 'trailer_clicked', 'recommendation_saved',
    'recommendation_rejected', 'recommendations_refreshed',
    'watch_intent_confirmed', 'feedback_submitted', 'api_error_shown'
  )))
),
checks AS (
  -- Titles -------------------------------------------------------------------
  SELECT 'title_key_unique' AS check_name, 'staging' AS layer, 'error' AS severity,
         (SELECT COUNT(*) - COUNT(DISTINCT title_key) FROM titles) AS failed_rows,
         (SELECT COUNT(*) FROM titles) AS total_rows,
         'Each media type and TMDB ID pair appears once' AS description
  UNION ALL
  SELECT 'title_required_fields', 'staging', 'error',
         (SELECT COUNT_IF(tmdb_id IS NULL OR title IS NULL OR media_type NOT IN ('movie', 'tv')) FROM titles),
         (SELECT COUNT(*) FROM titles),
         'Every title has an ID, a name, and a known media type'
  UNION ALL
  SELECT 'vote_average_in_range', 'staging', 'error',
         (SELECT COUNT_IF(vote_average < 0 OR vote_average > 10) FROM titles),
         (SELECT COUNT(*) FROM titles),
         'TMDB ratings stay between 0 and 10'
  UNION ALL
  SELECT 'release_date_parses', 'staging', 'warn',
         (SELECT COUNT_IF(release_date IS NULL) FROM titles),
         (SELECT COUNT(*) FROM titles),
         'Titles without a usable release date cannot use the freshness signal'
  UNION ALL
  SELECT 'overview_present', 'staging', 'warn',
         (SELECT COUNT_IF(overview IS NULL OR LENGTH(overview) < 20) FROM titles),
         (SELECT COUNT(*) FROM titles),
         'Titles without a real overview are skipped by AI mood classification'
  UNION ALL
  SELECT 'genre_names_resolve', 'marts', 'warn',
         (SELECT COUNT_IF(genre_name IS NULL) FROM PICKTONIGHT.MARTS.BRIDGE_TITLE_GENRE),
         (SELECT COUNT(*) FROM PICKTONIGHT.MARTS.BRIDGE_TITLE_GENRE),
         'Every genre ID on a title matches the TMDB genre list for its media type'
  -- Events -------------------------------------------------------------------
  UNION ALL
  SELECT 'event_properties_parse', 'staging', 'error',
         (SELECT COUNT_IF(properties IS NULL) FROM events),
         (SELECT COUNT(*) FROM events),
         'The properties column is valid JSON'
  UNION ALL
  SELECT 'event_timestamp_parses', 'staging', 'error',
         (SELECT COUNT_IF(event_at IS NULL) FROM events),
         (SELECT COUNT(*) FROM events),
         'The timestamp column parses as a timestamp'
  UNION ALL
  SELECT 'event_name_in_taxonomy', 'staging', 'error',
         (SELECT COUNT(*) FROM events WHERE event_name NOT IN (SELECT event_name FROM known_events)),
         (SELECT COUNT(*) FROM events),
         'Only the 17 taxonomy v3 events are present'
  UNION ALL
  SELECT 'taxonomy_version_is_3', 'staging', 'error',
         (SELECT COUNT_IF(taxonomy_version IS DISTINCT FROM 3) FROM events),
         (SELECT COUNT(*) FROM events),
         'Every event declares taxonomy version 3'
  UNION ALL
  SELECT 'event_uuid_unique', 'staging', 'error',
         (SELECT COUNT(*) - COUNT(DISTINCT event_uuid) FROM events),
         (SELECT COUNT(*) FROM events),
         'No event is loaded twice'
  UNION ALL
  SELECT 'recommendation_scope_present', 'staging', 'error',
         (SELECT COUNT_IF(recommendation_session_id IS NULL OR algorithm_version IS NULL)
            FROM events
           WHERE event_name IN ('context_submitted', 'recommendation_batch_viewed',
                                'recommendation_empty_shown', 'recommendation_item_shown',
                                'recommendation_opened', 'trailer_clicked',
                                'recommendation_saved', 'recommendation_rejected',
                                'recommendations_refreshed', 'watch_intent_confirmed',
                                'feedback_submitted', 'api_error_shown')),
         (SELECT COUNT(*) FROM events),
         'Recommendation events carry a journey ID and algorithm version'
  UNION ALL
  SELECT 'property_allowlist', 'staging', 'error',
         (SELECT COUNT(DISTINCT p.event_uuid)
            FROM event_property_names AS p
           WHERE p.property_name NOT IN (SELECT property_name FROM allowed_properties)),
         (SELECT COUNT(*) FROM events),
         'Privacy: no event carries a property outside the reviewed allowlist'
  UNION ALL
  SELECT 'no_participant_rows_in_internal_export', 'staging', 'error',
         (SELECT COUNT_IF(traffic_class IS DISTINCT FROM 'internal')
            FROM events WHERE data_origin = 'posthog_internal'),
         (SELECT COUNT(*) FROM events WHERE data_origin = 'posthog_internal'),
         'Privacy: the real PostHog export holds internal traffic only'
)
SELECT
  CURRENT_TIMESTAMP(),
  check_name,
  layer,
  severity,
  failed_rows,
  total_rows,
  CASE
    WHEN failed_rows = 0 THEN 'PASS'
    WHEN severity = 'warn' THEN 'WARN'
    ELSE 'FAIL'
  END,
  description
FROM checks;

-- Latest run, failures first.
SELECT check_name, layer, severity, failed_rows, total_rows, status, description
FROM DQ_RESULTS
WHERE run_at = (SELECT MAX(run_at) FROM DQ_RESULTS)
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, check_name;

-- If property_allowlist fails, this shows which property names leaked.
-- SELECT k.value::STRING AS property_name, COUNT(*) AS events
-- FROM PICKTONIGHT.STAGING.STG_EVENTS AS e,
--   LATERAL FLATTEN(input => OBJECT_KEYS(e.properties)) AS k
-- GROUP BY 1 ORDER BY 2 DESC;
