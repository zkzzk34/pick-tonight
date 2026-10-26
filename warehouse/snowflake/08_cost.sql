-- =============================================================================
-- 08_cost.sql
-- What the pipeline cost, by step.
--
-- Every script sets a QUERY_TAG like 'picktonight:marts', so query history can
-- be grouped by pipeline step. INFORMATION_SCHEMA functions have no delay;
-- the ACCOUNT_USAGE views can lag by up to a few hours.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE DATABASE PICKTONIGHT;
ALTER SESSION SET QUERY_TAG = 'picktonight:cost';

-- Time and data scanned per pipeline step over the last 6 days. The
-- QUERY_HISTORY table function rejects a start time 7 or more days back.
SELECT
  query_tag,
  COUNT(*)                                   AS queries,
  ROUND(SUM(total_elapsed_time) / 1000, 1)   AS elapsed_seconds,
  ROUND(SUM(bytes_scanned) / 1e6, 1)         AS mb_scanned,
  ROUND(MAX(total_elapsed_time) / 1000, 1)   AS slowest_query_seconds
FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY(
  END_TIME_RANGE_START => DATEADD('day', -6, CURRENT_TIMESTAMP()),
  RESULT_LIMIT => 10000
))
WHERE query_tag LIKE 'picktonight:%'
  -- Only finished queries: this query itself is still running and reports a
  -- meaningless elapsed time, and failed queries did no useful work.
  AND execution_status = 'SUCCESS'
GROUP BY query_tag
ORDER BY elapsed_seconds DESC;

-- Warehouse credits per hour for the project warehouse.
SELECT
  start_time,
  end_time,
  ROUND(credits_used, 4) AS credits_used
FROM TABLE(INFORMATION_SCHEMA.WAREHOUSE_METERING_HISTORY(
  DATE_RANGE_START => DATEADD('day', -7, CURRENT_TIMESTAMP()),
  WAREHOUSE_NAME => 'PICKTONIGHT_WH'
))
ORDER BY start_time;

SELECT ROUND(SUM(credits_used), 4) AS total_project_warehouse_credits
FROM TABLE(INFORMATION_SCHEMA.WAREHOUSE_METERING_HISTORY(
  DATE_RANGE_START => DATEADD('day', -7, CURRENT_TIMESTAMP()),
  WAREHOUSE_NAME => 'PICKTONIGHT_WH'
));

-- Storage used by each layer.
SELECT
  table_schema,
  COUNT(*)                                AS tables,
  SUM(row_count)                          AS row_count,
  ROUND(SUM(bytes) / 1e6, 2)              AS megabytes
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema IN ('RAW', 'MARTS', 'AI', 'GOVERNANCE')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY megabytes DESC;

-- Budget guard status.
SHOW RESOURCE MONITORS LIKE 'PICKTONIGHT_RM';

-- Account-wide credits by service, including any serverless use. This view can
-- lag by a few hours, so recent work may not show yet.
SELECT
  service_type,
  ROUND(SUM(credits_used), 4) AS credits_used
FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY
WHERE usage_date >= DATEADD('day', -30, CURRENT_DATE())
GROUP BY service_type
ORDER BY credits_used DESC;

-- Done for the day: stop the warehouse now instead of waiting for
-- auto-suspend.
ALTER WAREHOUSE PICKTONIGHT_WH SUSPEND;
