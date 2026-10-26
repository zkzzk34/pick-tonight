-- =============================================================================
-- 07_governance.sql
-- Least-privilege roles, masking policies, and sensitivity tags.
--
--   PICKTONIGHT_ENGINEER  runs the pipeline; reads every layer; sees real IDs
--   PICKTONIGHT_ANALYST   reads MARTS and AI only; pseudonymous IDs are hashed
--
-- The hash is deterministic, so analysts can still count distinct sessions
-- and join events to journeys without seeing the identifiers themselves. The
-- PROPERTIES column holds the same IDs inside JSON, so a second policy strips
-- them there too.
--
-- Masking policies need Enterprise edition or higher. Rerun this file after
-- rerunning 03_marts.sql, because rebuilding a table drops its policies.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
ALTER SESSION SET QUERY_TAG = 'picktonight:governance';

-- Roles ---------------------------------------------------------------------
CREATE ROLE IF NOT EXISTS PICKTONIGHT_ANALYST
  COMMENT = 'Reads modeled PickTonight data with identifiers masked';
CREATE ROLE IF NOT EXISTS PICKTONIGHT_ENGINEER
  COMMENT = 'Builds and runs the PickTonight pipeline';

-- Engineers can do everything analysts can. Custom roles roll up to SYSADMIN,
-- following Snowflake's recommended role hierarchy.
GRANT ROLE PICKTONIGHT_ANALYST TO ROLE PICKTONIGHT_ENGINEER;
GRANT ROLE PICKTONIGHT_ENGINEER TO ROLE SYSADMIN;

-- Let the current user switch into both roles for testing.
SET current_user_name = CURRENT_USER();
GRANT ROLE PICKTONIGHT_ANALYST TO USER IDENTIFIER($current_user_name);
GRANT ROLE PICKTONIGHT_ENGINEER TO USER IDENTIFIER($current_user_name);

-- Analyst grants: compute, MARTS, AI. Nothing in RAW, STAGING, or GOVERNANCE.
GRANT USAGE ON WAREHOUSE PICKTONIGHT_WH TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON SCHEMA PICKTONIGHT.MARTS TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA PICKTONIGHT.MARTS TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PICKTONIGHT.MARTS TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;

-- Engineer grants: every layer, the stages, and the training procedure.
GRANT OPERATE ON WAREHOUSE PICKTONIGHT_WH TO ROLE PICKTONIGHT_ENGINEER;
GRANT USAGE ON ALL SCHEMAS IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL TABLES IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL VIEWS IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT READ ON STAGE PICKTONIGHT.RAW.PICKTONIGHT_STAGE TO ROLE PICKTONIGHT_ENGINEER;
GRANT READ ON STAGE PICKTONIGHT.AI.MODEL_STAGE TO ROLE PICKTONIGHT_ENGINEER;
GRANT USAGE ON ALL PROCEDURES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;

-- Masking policies ------------------------------------------------------------
USE SCHEMA PICKTONIGHT.GOVERNANCE;

-- IF NOT EXISTS because an attached policy cannot be replaced. To change a
-- policy body later, use ALTER MASKING POLICY ... SET BODY.
CREATE MASKING POLICY IF NOT EXISTS MASK_PSEUDONYMOUS_ID
  AS (val STRING) RETURNS STRING ->
  CASE
    WHEN val IS NULL THEN NULL
    WHEN IS_ROLE_IN_SESSION('PICKTONIGHT_ENGINEER') THEN val
    ELSE 'masked_' || LEFT(SHA2(val, 256), 16)
  END
  COMMENT = 'Engineers see analytics identifiers; everyone else sees a stable hash';

CREATE MASKING POLICY IF NOT EXISTS MASK_EVENT_PROPERTIES
  AS (val VARIANT) RETURNS VARIANT ->
  CASE
    WHEN val IS NULL THEN NULL
    WHEN IS_ROLE_IN_SESSION('PICKTONIGHT_ENGINEER') THEN val
    ELSE OBJECT_DELETE(
      val::OBJECT,
      'session_id', 'recommendation_session_id', 'recommendation_item_id'
    )::VARIANT
  END
  COMMENT = 'Removes identifiers from event JSON for non-engineers';

-- FORCE replaces a policy that is already attached, so reruns succeed.
ALTER TABLE PICKTONIGHT.MARTS.FCT_EVENTS MODIFY
  COLUMN distinct_id SET MASKING POLICY MASK_PSEUDONYMOUS_ID FORCE,
  COLUMN session_id SET MASKING POLICY MASK_PSEUDONYMOUS_ID FORCE,
  COLUMN recommendation_session_id SET MASKING POLICY MASK_PSEUDONYMOUS_ID FORCE,
  COLUMN recommendation_item_id SET MASKING POLICY MASK_PSEUDONYMOUS_ID FORCE,
  COLUMN properties SET MASKING POLICY MASK_EVENT_PROPERTIES FORCE;

ALTER TABLE PICKTONIGHT.MARTS.FCT_RECOMMENDATION_JOURNEYS MODIFY
  COLUMN recommendation_session_id SET MASKING POLICY MASK_PSEUDONYMOUS_ID FORCE;

-- Sensitivity tags make the protected columns easy to find later.
CREATE TAG IF NOT EXISTS DATA_SENSITIVITY
  ALLOWED_VALUES 'pseudonymous_id', 'public_catalog'
  COMMENT = 'How sensitive a column is';

ALTER TABLE PICKTONIGHT.MARTS.FCT_EVENTS MODIFY
  COLUMN distinct_id SET TAG DATA_SENSITIVITY = 'pseudonymous_id',
  COLUMN session_id SET TAG DATA_SENSITIVITY = 'pseudonymous_id',
  COLUMN recommendation_session_id SET TAG DATA_SENSITIVITY = 'pseudonymous_id',
  COLUMN recommendation_item_id SET TAG DATA_SENSITIVITY = 'pseudonymous_id';
ALTER TABLE PICKTONIGHT.MARTS.DIM_TITLE SET TAG DATA_SENSITIVITY = 'public_catalog';

-- Test as the analyst -------------------------------------------------------------
-- Snowsight may turn on all of your roles as secondary roles. Turning them off
-- makes this test use the analyst role alone.
USE ROLE PICKTONIGHT_ANALYST;
USE SECONDARY ROLES NONE;
USE WAREHOUSE PICKTONIGHT_WH;

-- Expect masked_... values and properties without the ID fields.
SELECT event_name, distinct_id, session_id, recommendation_session_id, properties
FROM PICKTONIGHT.MARTS.FCT_EVENTS
WHERE recommendation_session_id IS NOT NULL
LIMIT 5;

-- Hashing keeps counts correct: this matches the engineer's count below.
SELECT COUNT(DISTINCT session_id) AS distinct_sessions_seen_by_analyst
FROM PICKTONIGHT.MARTS.FCT_EVENTS;

-- Run this line on its own (Run, not Run All). It should fail with
-- "does not exist or not authorized", because analysts cannot read RAW.
-- SELECT COUNT(*) FROM PICKTONIGHT.RAW.EVENTS;

-- Test as the engineer -----------------------------------------------------------
USE ROLE PICKTONIGHT_ENGINEER;
SELECT event_name, distinct_id, session_id, recommendation_session_id
FROM PICKTONIGHT.MARTS.FCT_EVENTS
WHERE recommendation_session_id IS NOT NULL
LIMIT 5;

SELECT COUNT(DISTINCT session_id) AS distinct_sessions_seen_by_engineer
FROM PICKTONIGHT.MARTS.FCT_EVENTS;

-- Back to normal.
USE ROLE ACCOUNTADMIN;
USE SECONDARY ROLES ALL;

-- Where the policies are attached.
SELECT ref_entity_name AS table_name, ref_column_name AS column_name, policy_name
FROM TABLE(PICKTONIGHT.INFORMATION_SCHEMA.POLICY_REFERENCES(
  REF_ENTITY_NAME => 'PICKTONIGHT.MARTS.FCT_EVENTS',
  REF_ENTITY_DOMAIN => 'table'
));
