-- =============================================================================
-- 00_setup.sql
-- One-time account setup for the PickTonight Snowflake warehouse.
--
-- Creates a budget-capped compute warehouse, the PICKTONIGHT database with one
-- schema per pipeline layer, the internal stage that receives local extracts,
-- and the file formats COPY INTO uses.
--
--   RAW         exact copies of the uploaded files, plus load lineage
--   STAGING     typed, flattened views over RAW (no business logic)
--   MARTS       modeled tables the analytics and AI steps read
--   AI          Snowpark ML outputs: embeddings, mood predictions, model files
--   GOVERNANCE  masking policies and data quality results
--
-- Safe to rerun: every statement is IF NOT EXISTS or OR REPLACE.
-- Run as ACCOUNTADMIN in a Snowsight SQL file with "Run All".
-- =============================================================================

USE ROLE ACCOUNTADMIN;
ALTER SESSION SET QUERY_TAG = 'picktonight:setup';

-- Compute ---------------------------------------------------------------------
-- XSMALL is plenty for a few thousand titles. A 60 second auto-suspend keeps
-- idle time from burning trial credits.
CREATE WAREHOUSE IF NOT EXISTS PICKTONIGHT_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'PickTonight warehouse project compute';

-- A resource monitor caps warehouse credits. Everything in this project,
-- including the Snowpark ML procedure, runs on this warehouse, so the monitor
-- covers it. 08_cost.sql reports actual use.
CREATE RESOURCE MONITOR IF NOT EXISTS PICKTONIGHT_RM
  WITH CREDIT_QUOTA = 20
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 75 PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND;

ALTER WAREHOUSE PICKTONIGHT_WH SET RESOURCE_MONITOR = PICKTONIGHT_RM;

USE WAREHOUSE PICKTONIGHT_WH;

-- Database and layer schemas ---------------------------------------------------
CREATE DATABASE IF NOT EXISTS PICKTONIGHT
  COMMENT = 'PickTonight catalog and product analytics warehouse';

CREATE SCHEMA IF NOT EXISTS PICKTONIGHT.RAW
  COMMENT = 'Exact copies of uploaded extracts with load lineage';
CREATE SCHEMA IF NOT EXISTS PICKTONIGHT.STAGING
  COMMENT = 'Typed and flattened views over RAW';
CREATE SCHEMA IF NOT EXISTS PICKTONIGHT.MARTS
  COMMENT = 'Modeled tables for analytics and AI';
CREATE SCHEMA IF NOT EXISTS PICKTONIGHT.AI
  COMMENT = 'Snowpark ML outputs, embeddings, and model files';
CREATE SCHEMA IF NOT EXISTS PICKTONIGHT.GOVERNANCE
  COMMENT = 'Masking policies and data quality results';

USE SCHEMA PICKTONIGHT.RAW;

-- File formats ---------------------------------------------------------------
-- NDJSON: one JSON record per line, written by warehouse:export-catalog.
CREATE OR REPLACE FILE FORMAT PICKTONIGHT.RAW.FF_NDJSON
  TYPE = JSON
  STRIP_OUTER_ARRAY = FALSE
  COMMENT = 'Newline-delimited JSON from the TMDB catalog export';

-- Event CSV: uuid,event,timestamp,distinct_id,properties. The properties column
-- is a quoted JSON string, so quotes must be honored.
CREATE OR REPLACE FILE FORMAT PICKTONIGHT.RAW.FF_EVENTS_CSV
  TYPE = CSV
  SKIP_HEADER = 1
  FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  NULL_IF = ('', 'NULL', 'null')
  EMPTY_FIELD_AS_NULL = TRUE
  COMMENT = 'PostHog event export and synthetic events';

-- Internal stage --------------------------------------------------------------
-- Files are uploaded here through Snowsight. Directory listing is enabled so
-- uploads are visible in the UI.
CREATE STAGE IF NOT EXISTS PICKTONIGHT.RAW.PICKTONIGHT_STAGE
  DIRECTORY = (ENABLE = TRUE)
  COMMENT = 'Landing zone for local TMDB and event extracts';

-- Model files written by the Snowpark training procedure.
CREATE STAGE IF NOT EXISTS PICKTONIGHT.AI.MODEL_STAGE
  COMMENT = 'Fitted scikit-learn pipelines saved by AI.TRAIN_TITLE_MODELS';

-- Check: five layer schemas besides PUBLIC and INFORMATION_SCHEMA, and the stages.
SHOW SCHEMAS IN DATABASE PICKTONIGHT;
SHOW STAGES IN DATABASE PICKTONIGHT;
