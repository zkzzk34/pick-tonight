-- =============================================================================
-- 10_semantic_view_checks.sql
-- Checks on the deployed semantic view that dbt cannot make from inside its
-- own role. Run after "dbt build", with Run All, and read the last result.
--
--   1. The deployed view carries all 20 verified questions.
--   2. The analyst session really has only the analyst role.
--   3. The analyst can ask the view questions...
--   4. ...and gets the same session count as the engineer, even though the
--      session IDs underneath are masked for the analyst...
--   5. ...but still cannot read the event fact directly.
--   6. No dimension in the view is an identifier.
--
-- The view lives in DBT_SEMANTIC and is built by dbt from
-- warehouse/dbt/models/semantic/sv_picktonight.sql. Reruns are safe.
-- =============================================================================

USE ROLE PICKTONIGHT_ENGINEER;
USE WAREHOUSE PICKTONIGHT_WH;
ALTER SESSION SET QUERY_TAG = 'picktonight:semantic-view-checks';

-- 1. Count the verified questions in the view's own DDL. Each one starts
--    with QUESTION followed by a quoted string.
EXECUTE IMMEDIATE $$
DECLARE
  v_ddl VARCHAR;
BEGIN
  SELECT GET_DDL('SEMANTIC_VIEW', 'PICKTONIGHT.DBT_SEMANTIC.SV_PICKTONIGHT') INTO :v_ddl;
  RETURN REGEXP_COUNT(v_ddl, 'QUESTION\\s+''', 1, 'i')::VARCHAR;
EXCEPTION
  WHEN OTHER THEN RETURN 'unknown: ' || LEFT(SQLERRM, 200);
END;
$$;
SET verified_questions = (SELECT $1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- The engineer's session count, to compare with the analyst's below.
SELECT session_count
FROM SEMANTIC_VIEW(PICKTONIGHT.DBT_SEMANTIC.SV_PICKTONIGHT METRICS events.session_count);
SET sessions_as_engineer = (SELECT $1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- 2. Switch to the analyst alone. Snowsight turns on all of your roles as
--    secondary roles by default, which would quietly give this session the
--    engineer's access too and make every check below meaningless. Turn them
--    off, then record whether the engineer role is still in the session.
USE ROLE PICKTONIGHT_ANALYST;
USE SECONDARY ROLES NONE;
SET engineer_in_session = (SELECT IS_ROLE_IN_SESSION('PICKTONIGHT_ENGINEER'));

-- 3. As the analyst: demand and supply per mood, through the semantic view.
SELECT mood_code, journey_count, titles_for_mood
FROM SEMANTIC_VIEW(PICKTONIGHT.DBT_SEMANTIC.SV_PICKTONIGHT
  DIMENSIONS moods.mood_code
  METRICS journeys.journey_count, title_moods.titles_for_mood)
ORDER BY mood_code;
SET analyst_mood_rows = (SELECT COUNT(*) FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- 4. As the analyst: distinct sessions. The analyst sees hashed session IDs,
--    and each hash is unique, so the count must match the engineer's.
SELECT session_count
FROM SEMANTIC_VIEW(PICKTONIGHT.DBT_SEMANTIC.SV_PICKTONIGHT METRICS events.session_count);
SET sessions_as_analyst = (SELECT $1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- 5. As the analyst: a direct read of the event fact must still fail. The
--    block catches the error, so the run reports it instead of stopping.
EXECUTE IMMEDIATE $$
DECLARE
  v_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO :v_rows FROM PICKTONIGHT.DBT_MARTS.FCT_EVENTS;
  RETURN 'FAIL: the analyst can read FCT_EVENTS';
EXCEPTION
  WHEN OTHER THEN RETURN 'PASS: blocked';
END;
$$;
SET direct_fact_read = (SELECT $1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- 6. As the analyst: list the view's dimensions and look for anything that
--    looks like an identifier.
EXECUTE IMMEDIATE $$
DECLARE
  v_total INTEGER;
  v_ids INTEGER;
BEGIN
  SHOW SEMANTIC DIMENSIONS IN PICKTONIGHT.DBT_SEMANTIC.SV_PICKTONIGHT;
  SELECT COUNT(*), COUNT_IF("name" ILIKE ANY ('%id', '%key', '%uuid%'))
    INTO :v_total, :v_ids
    FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
  RETURN v_total || ' dimensions, ' || v_ids || ' look like identifiers';
EXCEPTION
  WHEN OTHER THEN RETURN 'unknown: ' || LEFT(SQLERRM, 200);
END;
$$;
SET dimension_check = (SELECT $1 FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));

-- Give the worksheet its usual roles back.
USE SECONDARY ROLES ALL;

-- Expected: 20 | false | 7 | equal session counts | PASS: blocked |
--           31 dimensions, 0 look like identifiers
SELECT
  $verified_questions   AS verified_questions_in_view,
  $engineer_in_session  AS engineer_role_in_analyst_session,
  $analyst_mood_rows    AS mood_rows_seen_by_analyst,
  $sessions_as_engineer AS sessions_as_engineer,
  $sessions_as_analyst  AS sessions_as_analyst,
  $direct_fact_read     AS analyst_reading_fct_events,
  $dimension_check      AS dimensions;
