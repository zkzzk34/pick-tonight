-- =============================================================================
-- 10_cortex_analyst_evaluation_paid.sql
-- NOT RUN. Cortex is not available on the Snowflake trial. This file is the
-- ready version for a paid account, like 09_data_metric_functions_paid.sql.
--
-- Two checks answer two different questions:
--
--   dbt test verified_questions_match_truth   Are the verified answers right?
--                                             Runs on every build, on trial.
--   this file                                 Can Cortex Analyst find those
--                                             answers from the question alone?
--
-- Keeping them apart tells a wrong metric definition from a weak model.
--
-- Snowflake's evaluation runs each verified question through Cortex Analyst
-- with that question hidden, runs the SQL it writes, and has a judge model
-- score the result against the verified answer (sql_correctness, 0 to 1).
-- The config is 10_cortex_analyst_evaluation.yaml, next to this file.
--
-- Steps: run part 1 as ACCOUNTADMIN, upload the config in part 2, then run
-- parts 3 to 5 as PICKTONIGHT_ENGINEER. Evaluation runs use Cortex credits.
-- =============================================================================

-- 1. Privileges. Evaluation runs as background tasks, which ignore secondary
--    roles, so everything goes to one primary role. The engineer owns
--    DBT_SEMANTIC, so it already has CREATE TASK and CREATE DATASET there and
--    MONITOR on the view. USE AI FUNCTIONS is granted to PUBLIC by default.
USE ROLE ACCOUNTADMIN;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE PICKTONIGHT_ENGINEER;
GRANT EXECUTE TASK ON ACCOUNT TO ROLE PICKTONIGHT_ENGINEER;

-- 2. A stage for the config, next to the view it evaluates. Upload
--    10_cortex_analyst_evaluation.yaml to it uncompressed: with Snowsight's
--    file upload on the stage, or from a terminal with
--      PUT file://warehouse/snowflake/10_cortex_analyst_evaluation.yaml
--          @PICKTONIGHT.DBT_SEMANTIC.EVAL_CONFIGS AUTO_COMPRESS = FALSE OVERWRITE = TRUE;
USE ROLE PICKTONIGHT_ENGINEER;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.DBT_SEMANTIC;
ALTER SESSION SET QUERY_TAG = 'picktonight:cortex-analyst-evaluation';
CREATE STAGE IF NOT EXISTS EVAL_CONFIGS COMMENT = 'Cortex Analyst evaluation configs';
LIST @EVAL_CONFIGS;

-- 3. Start the run.
CALL EXECUTE_AI_EVALUATION(
  'START',
  OBJECT_CONSTRUCT('run_name', 'sv_picktonight_baseline'),
  '@PICKTONIGHT.DBT_SEMANTIC.EVAL_CONFIGS/10_cortex_analyst_evaluation.yaml'
);

-- 4. Rerun this until the status shows the run is complete.
CALL EXECUTE_AI_EVALUATION(
  'STATUS',
  OBJECT_CONSTRUCT('run_name', 'sv_picktonight_baseline'),
  '@PICKTONIGHT.DBT_SEMANTIC.EVAL_CONFIGS/10_cortex_analyst_evaluation.yaml'
);

-- 5. Results: the score for each question, the judge's reasoning, and the
--    response time. Compare later runs by run name to catch regressions.
SELECT *
FROM TABLE(SNOWFLAKE.LOCAL.GET_ANALYST_AI_EVALUATION_DATA(
  'PICKTONIGHT',
  'DBT_SEMANTIC',
  'SV_PICKTONIGHT',
  'SEMANTIC VIEW',
  'sv_picktonight_baseline'
));
