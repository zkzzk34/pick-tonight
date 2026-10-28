-- =============================================================================
-- 05_snowpark_ml.sql
-- Train the catalog models inside Snowflake with Snowpark Python.
--
-- Why Snowpark and not Cortex: Snowflake trial accounts block Cortex AI
-- functions (AI_EMBED, AI_CLASSIFY, and Cortex Search). Snowpark Python runs
-- scikit-learn on the project warehouse instead, so the data never leaves
-- Snowflake and the same resource monitor caps the cost.
--
-- What gets built:
--   AI.TRAIN_TITLE_MODELS()   stored procedure; trains both models, writes:
--     AI.TITLE_EMBEDDINGS       one 128-dimension VECTOR per title
--     AI.MOOD_MODEL_METRICS     5-fold cross-validated precision, recall, F1
--     AI.MODEL_RUNS             one summary row per training run
--     AI.TITLE_MOODS_PREDICTED  out-of-fold mood probabilities, rule labels,
--                               and confident disagreements
--     @AI.MODEL_STAGE           the fitted embedding pipeline (joblib)
--   AI.EMBED_TEXT(text)       UDF; embeds any text into the title vector space
--
-- Inputs: DBT_MARTS.TITLE_CATALOG_CURRENT and DBT_MARTS.TITLE_RULE_MOODS,
-- built by the dbt project in warehouse/dbt. Run dbt build first.
--
-- Before running: upload warehouse/snowpark/title_models.py to
-- PICKTONIGHT.RAW.PICKTONIGHT_STAGE (same upload step as the data files).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.AI;
ALTER SESSION SET QUERY_TAG = 'picktonight:snowpark-ml';

-- The model code must be on the stage. Expect one row.
LIST @PICKTONIGHT.RAW.PICKTONIGHT_STAGE PATTERN = '.*title_models[.]py';

-- Training procedure ----------------------------------------------------------
-- EXECUTE AS CALLER lets the procedure create tables and write the model file
-- with the caller's privileges. Snowflake requires it to be the last clause.
CREATE OR REPLACE PROCEDURE PICKTONIGHT.AI.TRAIN_TITLE_MODELS()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'scikit-learn', 'numpy', 'joblib')
  IMPORTS = ('@PICKTONIGHT.RAW.PICKTONIGHT_STAGE/title_models.py')
  HANDLER = 'title_models.train_procedure'
  COMMENT = 'Trains LSA title embeddings and a weakly supervised mood classifier'
  EXECUTE AS CALLER;

-- Returns a JSON summary: titles embedded, dimensions, explained variance,
-- mood F1, and the number of confident disagreements.
CALL PICKTONIGHT.AI.TRAIN_TITLE_MODELS();

-- Embedding UDF ---------------------------------------------------------------
-- Created after training because it imports the model file training wrote.
-- Returns an ARRAY; SQL casts it to VECTOR(FLOAT, 128) for similarity.
CREATE OR REPLACE FUNCTION PICKTONIGHT.AI.EMBED_TEXT(input_text STRING)
  RETURNS ARRAY
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  COMMENT = 'Embeds text into the PickTonight title vector space'
  IMPORTS = (
    '@PICKTONIGHT.RAW.PICKTONIGHT_STAGE/title_models.py',
    '@PICKTONIGHT.AI.MODEL_STAGE/title_embedder.joblib'
  )
  PACKAGES = ('scikit-learn', 'numpy', 'joblib')
  HANDLER = 'title_models.embed_text_udf';

-- Checks --------------------------------------------------------------------
-- Run All only shows the last result. To see any check, click inside it and
-- press Run (or Ctrl+Enter) to run just that statement.

-- 0. The latest training summary, saved by the procedure.
SELECT run_at, summary
FROM PICKTONIGHT.AI.MODEL_RUNS
ORDER BY run_at DESC
LIMIT 1;

-- 1. Every title has a 128-dimension vector.
SELECT
  (SELECT COUNT(*) FROM PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT)  AS titles,
  COUNT(*)                                            AS embedded,
  ANY_VALUE(ARRAY_SIZE(embedding::ARRAY))             AS dimensions
FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS;

-- 2. The UDF returns a vector of the same size.
SELECT ARRAY_SIZE(PICKTONIGHT.AI.EMBED_TEXT('a cozy animated movie for a family night')) AS query_dimensions;

-- 3. How well title and overview text recover each genre-based mood
--    (5-fold cross-validation: every title is scored by a model that did
--    not train on it).
SELECT mood, precision_score, recall_score, f1_score, rule_positives, rule_positive_rate
FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
ORDER BY f1_score DESC;

-- 4. Where the text model and the genre rules disagree most confidently.
SELECT
  p.disagreement,
  p.mood,
  d.title,
  d.media_type,
  d.genre_names_text,
  p.probability,
  LEFT(d.overview, 160) AS overview_start
FROM PICKTONIGHT.AI.TITLE_MOODS_PREDICTED AS p
JOIN PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT AS d
  ON d.title_key = p.title_key
WHERE p.disagreement <> 'none'
ORDER BY ABS(p.probability - 0.5) DESC
LIMIT 25;

-- 5. Disagreement totals by mood.
SELECT mood, disagreement, COUNT(*) AS titles
FROM PICKTONIGHT.AI.TITLE_MOODS_PREDICTED
WHERE disagreement <> 'none'
GROUP BY ALL
ORDER BY mood, disagreement;
