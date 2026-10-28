-- =============================================================================
-- 07_governance_checks.sql
-- Proves the governance works. Run after 07_governance.sql and a dbt build.
--
-- Each check stores its answer in a session variable while running as the
-- right role. The last statement prints them all in one row, so Run All
-- shows the whole result. Expected values:
--
--   tagged_columns                       6   (5 on fct_events, 1 on journeys)
--   analyst_grants_on_fct_events         0   (analysts use the secure view)
--   sample_id_seen_by_analyst            masked_...
--   unmasked_ids_seen_by_analyst         0
--   distinct_sessions (both roles)       equal
--   journeys_joined (both roles)         equal
--   titles_seen_by_analyst               the current catalog size
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
ALTER SESSION SET QUERY_TAG = 'picktonight:governance-checks';

-- 1. Tags dbt set after the build.
SET tagged_columns = (
  SELECT COUNT(*) FROM (
    SELECT column_name
    FROM TABLE(PICKTONIGHT.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(
      'PICKTONIGHT.DBT_MARTS.FCT_EVENTS', 'table'))
    WHERE tag_name = 'DATA_SENSITIVITY'
    UNION ALL
    SELECT column_name
    FROM TABLE(PICKTONIGHT.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(
      'PICKTONIGHT.DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS', 'table'))
    WHERE tag_name = 'DATA_SENSITIVITY'
  )
);

-- 2. Analysts must have no grant on the raw event fact.
SHOW GRANTS ON TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS;
SET analyst_grants_on_fct_events = (
  SELECT COUNT(*) FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
  WHERE "grantee_name" = 'PICKTONIGHT_ANALYST'
);

-- 3. As the analyst. Snowsight may turn on all of your roles as secondary
--    roles. Turning them off makes these checks use the analyst role alone.
USE ROLE PICKTONIGHT_ANALYST;
USE SECONDARY ROLES NONE;

SET sample_id_seen_by_analyst = (
  SELECT ANY_VALUE(session_id) FROM PICKTONIGHT.DBT_ANALYST.ANALYST_EVENTS
);
SET unmasked_ids_seen_by_analyst = (
  SELECT COUNT_IF(session_id NOT LIKE 'masked_%' OR distinct_id NOT LIKE 'masked_%')
  FROM PICKTONIGHT.DBT_ANALYST.ANALYST_EVENTS
);
SET analyst_sessions = (
  SELECT COUNT(DISTINCT session_id) FROM PICKTONIGHT.DBT_ANALYST.ANALYST_EVENTS
);
-- Journeys still join to their events on the hashed ID.
SET analyst_journeys_joined = (
  SELECT COUNT(*)
  FROM PICKTONIGHT.DBT_ANALYST.ANALYST_JOURNEYS AS j
  WHERE EXISTS (
    SELECT 1 FROM PICKTONIGHT.DBT_ANALYST.ANALYST_EVENTS AS e
    WHERE e.recommendation_session_id = j.recommendation_session_id
  )
);
-- Public marts stay readable and unmasked.
SET titles_seen_by_analyst = (
  SELECT COUNT(*) FROM PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT
);

-- 4. As the engineer, on the fact tables themselves.
USE ROLE PICKTONIGHT_ENGINEER;

SET engineer_sessions = (
  SELECT COUNT(DISTINCT session_id) FROM PICKTONIGHT.DBT_MARTS.FCT_EVENTS
);
SET engineer_journeys_joined = (
  SELECT COUNT(*)
  FROM PICKTONIGHT.DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS AS j
  WHERE EXISTS (
    SELECT 1 FROM PICKTONIGHT.DBT_MARTS.FCT_EVENTS AS e
    WHERE e.recommendation_session_id = j.recommendation_session_id
  )
);

-- Back to normal, then one row with every answer.
USE ROLE ACCOUNTADMIN;
USE SECONDARY ROLES ALL;

SELECT
  $tagged_columns                AS tagged_columns,
  $analyst_grants_on_fct_events  AS analyst_grants_on_fct_events,
  $sample_id_seen_by_analyst     AS sample_id_seen_by_analyst,
  $unmasked_ids_seen_by_analyst  AS unmasked_ids_seen_by_analyst,
  $analyst_sessions              AS distinct_sessions_seen_by_analyst,
  $engineer_sessions             AS distinct_sessions_seen_by_engineer,
  $analyst_journeys_joined       AS journeys_joined_by_analyst,
  $engineer_journeys_joined      AS journeys_joined_by_engineer,
  $titles_seen_by_analyst        AS titles_seen_by_analyst;

-- Optional, run on its own (Run, not Run All) after USE ROLE PICKTONIGHT_ANALYST:
-- it should fail with "does not exist or not authorized".
-- SELECT COUNT(*) FROM PICKTONIGHT.DBT_MARTS.FCT_EVENTS;
