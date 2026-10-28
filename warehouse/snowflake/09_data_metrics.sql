-- =============================================================================
-- 09_data_metrics.sql
-- Scheduled data quality metrics, built the way Snowflake's data metric
-- functions work.
--
-- Snowflake's data metric functions (DMFs) are not available on trial
-- accounts, so this file builds the same pattern by hand:
--
--   DBT_SEEDS.DATA_METRIC_DEFINITIONS      which metric to measure on which
--                                          column, and its allowed range. A
--                                          reviewed dbt seed kept in Git.
--   GOVERNANCE.MEASURE_DATA_METRICS()      measures every definition and
--                                          appends one row per metric
--   GOVERNANCE.DQ_METRICS                  every measurement ever taken
--   GOVERNANCE.DQ_METRICS_LATEST           the latest result per metric
--   GOVERNANCE.MEASURE_DATA_METRICS_DAILY  task: runs the procedure every
--                                          morning at 7:00 New York time
--
-- Metric names follow Snowflake's system DMFs: ROW_COUNT, NULL_COUNT,
-- DUPLICATE_COUNT, and FRESHNESS (seconds since the newest timestamp).
-- Here DUPLICATE_COUNT counts extra copies of non-null values.
-- 09_data_metric_functions_paid.sql is the real DMF version for a paid account.
--
-- dbt watches the watcher: a source freshness check warns if the task stops
-- adding rows, and the test latest_data_metrics_pass reports failed metrics.
--
-- Run after "dbt seed --select data_metric_definitions". Reruns are safe.
-- Cost: about one X-Small warehouse minute per day, under PICKTONIGHT_RM.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.GOVERNANCE;
ALTER SESSION SET QUERY_TAG = 'picktonight:data-metrics';

-- Results history -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS DQ_METRICS (
  measured_at    TIMESTAMP_LTZ  COMMENT 'When this run started; shared by every metric in the run',
  metric_id      VARCHAR        COMMENT 'ID from DATA_METRIC_DEFINITIONS',
  table_name     VARCHAR,
  column_name    VARCHAR,
  metric_name    VARCHAR,
  metric_value   NUMBER,
  min_expected   NUMBER,
  max_expected   NUMBER,
  status         VARCHAR        COMMENT 'PASS, or FAIL when the value is outside the range or missing'
)
COMMENT = 'Every data quality measurement taken by MEASURE_DATA_METRICS()';

-- Measuring procedure ------------------------------------------------------------
-- For each definition, it builds one INSERT ... SELECT that computes the
-- metric and judges it against the range in the same statement. Table and
-- column names come from the reviewed seed, never from user input, and the
-- other values are passed as bind variables.
CREATE OR REPLACE PROCEDURE MEASURE_DATA_METRICS()
  RETURNS VARCHAR
  LANGUAGE SQL
  COMMENT = 'Measures every metric in DBT_SEEDS.DATA_METRIC_DEFINITIONS and appends the results to DQ_METRICS'
  EXECUTE AS OWNER
AS
$$
DECLARE
  run_at          TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  v_metric_id     VARCHAR;
  v_table_name    VARCHAR;
  v_column_name   VARCHAR;
  v_metric_name   VARCHAR;
  v_min_expected  NUMBER;
  v_max_expected  NUMBER;
  v_measure_sql   VARCHAR;
  v_insert_sql    VARCHAR;
  checked         INTEGER DEFAULT 0;
  failed          INTEGER DEFAULT 0;
  unknown_metric  EXCEPTION (-20001, 'DATA_METRIC_DEFINITIONS has a metric name this procedure does not know.');
  definitions CURSOR FOR
    SELECT metric_id, table_name, column_name, metric_name, min_expected, max_expected
    FROM PICKTONIGHT.DBT_SEEDS.DATA_METRIC_DEFINITIONS
    ORDER BY metric_id;
BEGIN
  FOR definition IN definitions DO
    -- Copy the row into variables: only variables can be bound into SQL.
    v_metric_id    := definition.metric_id;
    v_table_name   := definition.table_name;
    v_column_name  := definition.column_name;
    v_metric_name  := definition.metric_name;
    v_min_expected := definition.min_expected;
    v_max_expected := definition.max_expected;

    -- The query that returns one number, named metric_value.
    v_measure_sql := CASE v_metric_name
      WHEN 'ROW_COUNT' THEN
        'SELECT COUNT(*) AS metric_value FROM PICKTONIGHT.' || v_table_name
      WHEN 'NULL_COUNT' THEN
        'SELECT COUNT_IF(' || v_column_name || ' IS NULL) AS metric_value FROM PICKTONIGHT.' || v_table_name
      WHEN 'DUPLICATE_COUNT' THEN
        'SELECT COUNT(' || v_column_name || ') - COUNT(DISTINCT ' || v_column_name || ') AS metric_value FROM PICKTONIGHT.' || v_table_name
      WHEN 'FRESHNESS' THEN
        'SELECT DATEDIFF(''second'', MAX(' || v_column_name || '), CURRENT_TIMESTAMP()) AS metric_value FROM PICKTONIGHT.' || v_table_name
    END;
    IF (v_measure_sql IS NULL) THEN
      RAISE unknown_metric;
    END IF;

    v_insert_sql :=
      'INSERT INTO PICKTONIGHT.GOVERNANCE.DQ_METRICS '
      || '(measured_at, metric_id, table_name, column_name, metric_name, metric_value, min_expected, max_expected, status) '
      || 'SELECT ?, ?, ?, ?, ?, m.metric_value, ?, ?, '
      || 'CASE WHEN m.metric_value IS NULL THEN ''FAIL'' '
      || 'WHEN ? IS NOT NULL AND m.metric_value < ? THEN ''FAIL'' '
      || 'WHEN ? IS NOT NULL AND m.metric_value > ? THEN ''FAIL'' '
      || 'ELSE ''PASS'' END '
      || 'FROM (' || v_measure_sql || ') AS m';

    EXECUTE IMMEDIATE :v_insert_sql USING (
      run_at, v_metric_id, v_table_name, v_column_name, v_metric_name,
      v_min_expected, v_max_expected,
      v_min_expected, v_min_expected,
      v_max_expected, v_max_expected
    );
  END FOR;

  SELECT COUNT(*), COUNT_IF(status = 'FAIL')
    INTO :checked, :failed
    FROM PICKTONIGHT.GOVERNANCE.DQ_METRICS
    WHERE measured_at = :run_at;

  RETURN 'Measured ' || checked || ' metrics, ' || failed || ' failed.';
END;
$$;

-- Latest result per metric ---------------------------------------------------------
CREATE OR REPLACE VIEW DQ_METRICS_LATEST
  COMMENT = 'The most recent measurement of each metric'
AS
SELECT *
FROM DQ_METRICS
QUALIFY ROW_NUMBER() OVER (PARTITION BY metric_id ORDER BY measured_at DESC) = 1;

-- dbt reads these to check freshness and report failures.
GRANT SELECT ON TABLE DQ_METRICS TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON VIEW DQ_METRICS_LATEST TO ROLE PICKTONIGHT_ENGINEER;

-- Schedule ----------------------------------------------------------------------
-- Like a DMF schedule. Tasks are created suspended, so RESUME starts it.
CREATE OR REPLACE TASK MEASURE_DATA_METRICS_DAILY
  WAREHOUSE = PICKTONIGHT_WH
  SCHEDULE = 'USING CRON 0 7 * * * America/New_York'
  COMMENT = 'Measures the data quality metrics every morning'
AS
  CALL PICKTONIGHT.GOVERNANCE.MEASURE_DATA_METRICS();

ALTER TASK MEASURE_DATA_METRICS_DAILY RESUME;

-- First run, now ------------------------------------------------------------------
-- Expect "Measured 12 metrics, 0 failed."
CALL MEASURE_DATA_METRICS();

-- Prove the task itself runs, not just the procedure. It runs in the
-- background; its history is the query at the bottom of this file.
EXECUTE TASK MEASURE_DATA_METRICS_DAILY;

-- Check: every metric's latest result. Failures sort first.
SELECT metric_id, metric_name, metric_value, min_expected, max_expected, status, measured_at
FROM DQ_METRICS_LATEST
ORDER BY status, metric_id;

-- A minute later, run this on its own (Run, not Run All) to see the task runs:
-- SELECT name, state, scheduled_time, completed_time, return_value
-- FROM TABLE(PICKTONIGHT.INFORMATION_SCHEMA.TASK_HISTORY(TASK_NAME => 'MEASURE_DATA_METRICS_DAILY'))
-- ORDER BY scheduled_time DESC
-- LIMIT 5;
