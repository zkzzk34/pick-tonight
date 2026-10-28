-- =============================================================================
-- 07_governance.sql
-- Least-privilege roles, the sensitivity tag, and tag-based masking.
--
--   PICKTONIGHT_ENGINEER  runs dbt and the ML steps; reads every layer and
--                         sees real identifiers
--   PICKTONIGHT_ANALYST   reads the public dbt marts and the secure views in
--                         DBT_ANALYST; pseudonymous IDs are hashed
--
-- How the pieces fit:
--   1. This file creates the DATA_SENSITIVITY tag and two masking policies,
--      and attaches the policies to the tag. Any column with the tag is masked.
--   2. dbt reads meta.sensitivity on each mart column and sets the tag after
--      every build (macro apply_sensitivity_tags). A rebuilt table gets its
--      tags back in the same run, so a rebuild can no longer drop the masking.
--   3. dbt grants the analyst role SELECT on the public marts and the secure
--      views, and USAGE on their schemas. The two event facts are not granted:
--      analysts read events and journeys only through the secure views.
--
-- The hash is deterministic, so analysts can still count distinct sessions
-- and join events to journeys without seeing the identifiers themselves.
--
-- Run this file once as ACCOUNTADMIN before the dbt build that applies the
-- tags, then run 07_governance_checks.sql after it. Reruns are safe.
-- Tag-based masking needs Enterprise edition.
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

-- Analyst grants: compute and the AI outputs. Access to the dbt marts and
-- secure views is granted by dbt itself, model by model.
GRANT USAGE ON WAREHOUSE PICKTONIGHT_WH TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT USAGE ON ALL FUNCTIONS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;

-- Engineer grants: run the warehouse, read every layer, and create the dbt
-- schemas. The FUTURE grant on AI matters because 05 and 06 recreate their
-- tables, and a recreated table loses grants made on the old one.
GRANT OPERATE ON WAREHOUSE PICKTONIGHT_WH TO ROLE PICKTONIGHT_ENGINEER;
GRANT CREATE SCHEMA ON DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT USAGE ON ALL SCHEMAS IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL TABLES IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL VIEWS IN DATABASE PICKTONIGHT TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PICKTONIGHT.RAW TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;
GRANT READ ON STAGE PICKTONIGHT.RAW.PICKTONIGHT_STAGE TO ROLE PICKTONIGHT_ENGINEER;
GRANT READ ON STAGE PICKTONIGHT.AI.MODEL_STAGE TO ROLE PICKTONIGHT_ENGINEER;
GRANT USAGE ON ALL PROCEDURES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;

-- Sensitivity tag ------------------------------------------------------------
USE SCHEMA PICKTONIGHT.GOVERNANCE;

CREATE TAG IF NOT EXISTS DATA_SENSITIVITY
  COMMENT = 'How sensitive a column is. Drives tag-based masking.';

-- Reset the allowed values to exactly this list, so reruns succeed.
--   pseudonymous_id            an ID column, hashed for non-engineers
--   contains_pseudonymous_ids  a JSON column that holds IDs, stripped for non-engineers
--   public_catalog             public TMDB data, never masked
ALTER TAG DATA_SENSITIVITY UNSET ALLOWED_VALUES;
ALTER TAG DATA_SENSITIVITY ADD ALLOWED_VALUES
  'pseudonymous_id', 'contains_pseudonymous_ids', 'public_catalog';

-- dbt sets the tag on mart columns after every build. APPLY on a tag that
-- already carries a masking policy is all a role needs to do that.
GRANT APPLY ON TAG DATA_SENSITIVITY TO ROLE PICKTONIGHT_ENGINEER;

-- Tag-based masking policies ---------------------------------------------------
-- A tag can carry one masking policy per data type: one for strings, one for
-- JSON. Each policy reads the tag's value on the column it is protecting, so
-- a column tagged public_catalog passes through unchanged.
-- IF NOT EXISTS because an attached policy cannot be replaced. To change a
-- body later, use ALTER MASKING POLICY ... SET BODY.
CREATE MASKING POLICY IF NOT EXISTS MASK_TAGGED_STRING
  AS (val STRING) RETURNS STRING ->
  CASE
    WHEN val IS NULL THEN NULL
    WHEN COALESCE(SYSTEM$GET_TAG_ON_CURRENT_COLUMN('PICKTONIGHT.GOVERNANCE.DATA_SENSITIVITY'), '')
         <> 'pseudonymous_id' THEN val
    WHEN IS_ROLE_IN_SESSION('PICKTONIGHT_ENGINEER') THEN val
    ELSE 'masked_' || LEFT(SHA2(val, 256), 16)
  END
  COMMENT = 'Columns tagged pseudonymous_id: engineers see the ID, everyone else a stable hash';

CREATE MASKING POLICY IF NOT EXISTS MASK_TAGGED_VARIANT
  AS (val VARIANT) RETURNS VARIANT ->
  CASE
    WHEN val IS NULL THEN NULL
    WHEN COALESCE(SYSTEM$GET_TAG_ON_CURRENT_COLUMN('PICKTONIGHT.GOVERNANCE.DATA_SENSITIVITY'), '')
         <> 'contains_pseudonymous_ids' THEN val
    WHEN IS_ROLE_IN_SESSION('PICKTONIGHT_ENGINEER') THEN val
    ELSE OBJECT_DELETE(
      val::OBJECT,
      'session_id', 'recommendation_session_id', 'recommendation_item_id'
    )::VARIANT
  END
  COMMENT = 'Columns tagged contains_pseudonymous_ids: the ID fields are removed for non-engineers';

-- Attach both policies to the tag. Attaching a policy that is already
-- attached fails, so a rerun reports that instead of stopping Run All.
EXECUTE IMMEDIATE $$
BEGIN
  ALTER TAG PICKTONIGHT.GOVERNANCE.DATA_SENSITIVITY SET
    MASKING POLICY PICKTONIGHT.GOVERNANCE.MASK_TAGGED_STRING,
    MASKING POLICY PICKTONIGHT.GOVERNANCE.MASK_TAGGED_VARIANT;
  RETURN 'Masking policies attached to DATA_SENSITIVITY.';
EXCEPTION
  WHEN STATEMENT_ERROR THEN
    RETURN 'Not attached in this run: ' || SQLERRM;
END;
$$;

-- Check: the tag, its allowed values, and the engineer's APPLY privilege.
SHOW TAGS LIKE 'DATA_SENSITIVITY' IN SCHEMA PICKTONIGHT.GOVERNANCE;
SHOW GRANTS ON TAG PICKTONIGHT.GOVERNANCE.DATA_SENSITIVITY;
