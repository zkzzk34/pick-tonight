-- =============================================================================
-- 09_data_metric_functions_paid.sql
-- NOT RUN. Snowflake trial accounts do not support data metric functions.
--
-- On a paid Enterprise account, this replaces the hand-built task in
-- 09_data_metrics.sql with Snowflake's own system data metric functions
-- (DMFs) and expectations, on the same columns and with the same ranges as
-- DBT_SEEDS.DATA_METRIC_DEFINITIONS. Results land in
-- SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS, and expectation status in
-- SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_EXPECTATION_STATUS.
--
-- One catch carries over from masking: dbt rebuilds tables with
-- CREATE OR REPLACE, which drops DMF associations the same way it drops
-- column tags. In production these statements would run as a dbt post-hook
-- generated from the seed, like apply_sensitivity_tags does for tags.
--
-- Generated from dbt/seeds/data_metric_definitions.csv. Keep them in step.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;

-- DBT_MARTS.DIM_TITLE ------------------------------------------------------
-- Run the metrics whenever the table changes, like the daily task but event-driven.
ALTER TABLE PICKTONIGHT.DBT_MARTS.DIM_TITLE SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
-- Every title version has its own surrogate key
ALTER TABLE PICKTONIGHT.DBT_MARTS.DIM_TITLE
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.DUPLICATE_COUNT ON (title_version_key)
    EXPECTATION dim_title__title_version_key__duplicate_count (VALUE = 0);
-- Every title version has a surrogate key
ALTER TABLE PICKTONIGHT.DBT_MARTS.DIM_TITLE
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.NULL_COUNT ON (title_version_key)
    EXPECTATION dim_title__title_version_key__null_count (VALUE = 0);

-- DBT_MARTS.FCT_EVENTS -----------------------------------------------------
-- Run the metrics whenever the table changes, like the daily task but event-driven.
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
-- No event is stored twice
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.DUPLICATE_COUNT ON (event_uuid)
    EXPECTATION fct_events__event_uuid__duplicate_count (VALUE = 0);
-- Every event has an ID
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.NULL_COUNT ON (event_uuid)
    EXPECTATION fct_events__event_uuid__null_count (VALUE = 0);
-- Events were loaded in the last 30 days
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.FRESHNESS ON (loaded_at)
    EXPECTATION fct_events__loaded_at__freshness (VALUE <= 2592000);
-- The event fact is not empty
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_EVENTS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.ROW_COUNT ON ()
    EXPECTATION fct_events__row_count (VALUE >= 1);

-- DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS ------------------------------------
-- Run the metrics whenever the table changes, like the daily task but event-driven.
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
-- No journey is stored twice
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.DUPLICATE_COUNT ON (journey_key)
    EXPECTATION fct_recommendation_journeys__journey_key__duplicate_count (VALUE = 0);
-- Every journey has a surrogate key
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_RECOMMENDATION_JOURNEYS
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.NULL_COUNT ON (journey_key)
    EXPECTATION fct_recommendation_journeys__journey_key__null_count (VALUE = 0);

-- DBT_MARTS.FCT_TITLE_POPULARITY -------------------------------------------
-- Run the metrics whenever the table changes, like the daily task but event-driven.
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_TITLE_POPULARITY SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
-- No export of a title is stored twice
ALTER TABLE PICKTONIGHT.DBT_MARTS.FCT_TITLE_POPULARITY
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.DUPLICATE_COUNT ON (title_popularity_key)
    EXPECTATION fct_title_popularity__title_popularity_key__duplicate_count (VALUE = 0);

-- DBT_MARTS.TITLE_CATALOG_CURRENT ------------------------------------------
-- Run the metrics whenever the table changes, like the daily task but event-driven.
ALTER TABLE PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
-- The catalog was loaded in the last 30 days
ALTER TABLE PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.FRESHNESS ON (loaded_at)
    EXPECTATION title_catalog_current__loaded_at__freshness (VALUE <= 2592000);
-- A broken export would shrink the catalog below 1000 titles
ALTER TABLE PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.ROW_COUNT ON ()
    EXPECTATION title_catalog_current__row_count (VALUE >= 1000);
-- Each title appears once in the current catalog
ALTER TABLE PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT
  ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.DUPLICATE_COUNT ON (title_key)
    EXPECTATION title_catalog_current__title_key__duplicate_count (VALUE = 0);

-- Check: evaluate every expectation on one table right now.
SELECT *
FROM TABLE(SYSTEM$EVALUATE_DATA_QUALITY_EXPECTATIONS(
  REF_ENTITY_NAME => 'PICKTONIGHT.DBT_MARTS.FCT_EVENTS'));

-- Check: expectation status from the scheduled runs.
SELECT *
FROM SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_EXPECTATION_STATUS
LIMIT 50;
