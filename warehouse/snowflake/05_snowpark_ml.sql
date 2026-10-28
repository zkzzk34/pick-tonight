-- =============================================================================
-- 05_snowpark_ml.sql
-- Train the catalog models inside Snowflake with Snowpark Python, behind
-- quality gates.
--
-- Why Snowpark and not Cortex: Snowflake trial accounts block Cortex AI
-- functions (AI_EMBED, AI_CLASSIFY, and Cortex Search). Snowpark Python runs
-- scikit-learn on the project warehouse instead, so the data never leaves
-- Snowflake and the same resource monitor caps the cost.
--
-- How a training run works:
--   1. AI.TRAIN_TITLE_MODELS() trains a candidate and checks it against the
--      reviewed gates in DBT_SEEDS.AI_QUALITY_GATES: a floor for each metric,
--      and how far it may drop below the live model. Search quality is part
--      of the check, scored on DBT_SEEDS.SEARCH_EVAL_QUERIES.
--   2. Every run is recorded, with what it was trained on.
--   3. Only a run that passes every gate writes its outputs and becomes the
--      live model. A rejected run leaves the live model exactly as it was.
--
-- What gets built:
--   AI.TRAIN_TITLE_MODELS()           the training procedure
--   AI.MODEL_RUNS                     one row per run: status, summary, and
--                                     the training data record (LINEAGE)
--   AI.MODEL_RUN_METRICS              every number each run produced
--   AI.MODEL_GATE_RESULTS             each gate's verdict for each run
--   AI.TITLE_EMBEDDINGS_HISTORY       embeddings from every promoted run
--   AI.TITLE_MOODS_PREDICTED_HISTORY  mood predictions from every promoted run
--   AI.LIVE_MODEL_RUN                 view: the newest promoted run
--   AI.TITLE_EMBEDDINGS               view: the live embeddings
--   AI.TITLE_MOODS_PREDICTED          view: the live mood predictions
--   AI.MOOD_MODEL_METRICS             view: the live model's mood scores
--   @AI.MODEL_STAGE                   title_embedder.joblib for the live model,
--                                     and runs/ with one file per run
--   AI.EMBED_TEXT(text)               UDF: embeds text with the live model
--
-- The three views keep their old names, so 06_vector_search.sql and every
-- other reader work unchanged.
--
-- Inputs: DBT_MARTS.TITLE_CATALOG_CURRENT, DBT_MARTS.TITLE_RULE_MOODS, and the
-- seeds AI_QUALITY_GATES and SEARCH_EVAL_QUERIES, all built by dbt.
--
-- Before running: upload warehouse/snowpark/title_models.py to
-- PICKTONIGHT.RAW.PICKTONIGHT_STAGE (same upload step as the data files).
-- Reruns are safe: each run is a new candidate.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.AI;
ALTER SESSION SET QUERY_TAG = 'picktonight:snowpark-ml';

-- The model code must be on the stage. Expect one row.
LIST @PICKTONIGHT.RAW.PICKTONIGHT_STAGE PATTERN = '.*title_models[.]py';

-- Run records -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS PICKTONIGHT.AI.MODEL_RUNS (RUN_AT TIMESTAMP_LTZ, SUMMARY VARIANT);
-- Added with quality gates. Runs from before gates keep NULLs here.
ALTER TABLE PICKTONIGHT.AI.MODEL_RUNS ADD COLUMN IF NOT EXISTS RUN_ID VARCHAR;
ALTER TABLE PICKTONIGHT.AI.MODEL_RUNS ADD COLUMN IF NOT EXISTS STATUS VARCHAR;
ALTER TABLE PICKTONIGHT.AI.MODEL_RUNS ADD COLUMN IF NOT EXISTS LINEAGE VARIANT;

CREATE TABLE IF NOT EXISTS PICKTONIGHT.AI.MODEL_RUN_METRICS (
  RUN_ID        VARCHAR,
  METRIC_NAME   VARCHAR,
  SCOPE         VARCHAR  COMMENT 'all, a mood, or a search query ID',
  METRIC_VALUE  FLOAT,
  MODEL_VERSION VARCHAR
)
COMMENT = 'Every number each training run produced';

CREATE TABLE IF NOT EXISTS PICKTONIGHT.AI.MODEL_GATE_RESULTS (
  RUN_ID       VARCHAR,
  GATE_ID      VARCHAR,
  METRIC_NAME  VARCHAR,
  SCOPE        VARCHAR,
  METRIC_VALUE FLOAT    COMMENT 'The candidate''s value',
  MIN_VALUE    FLOAT    COMMENT 'The floor from the gate',
  LIVE_VALUE   FLOAT    COMMENT 'The live model''s value when the run started',
  MAX_DROP     FLOAT    COMMENT 'How far below the live value the candidate may fall',
  PASSED       BOOLEAN,
  REASON       VARCHAR
)
COMMENT = 'Each quality gate''s verdict for each training run';

CREATE TABLE IF NOT EXISTS PICKTONIGHT.AI.TITLE_EMBEDDINGS_HISTORY (
  RUN_ID        VARCHAR,
  TITLE_KEY     VARCHAR,
  MEDIA_TYPE    VARCHAR,
  EMBEDDING     VECTOR(FLOAT, 128),
  MODEL_VERSION VARCHAR,
  TRAINED_AT    TIMESTAMP_LTZ
)
COMMENT = 'Title embeddings from every promoted run';

CREATE TABLE IF NOT EXISTS PICKTONIGHT.AI.TITLE_MOODS_PREDICTED_HISTORY (
  RUN_ID        VARCHAR,
  TITLE_KEY     VARCHAR,
  MOOD          VARCHAR,
  PROBABILITY   FLOAT,
  PREDICTED     BOOLEAN,
  RULE_LABEL    BOOLEAN,
  DISAGREEMENT  VARCHAR,
  MODEL_VERSION VARCHAR
)
COMMENT = 'Out-of-fold mood predictions from every promoted run';

-- One-time move to gated training ------------------------------------------------
-- Before gates, training wrote the live tables directly. This block keeps
-- that model live instead of throwing it away: it copies its outputs into
-- the history tables, records its scores (search scores come from
-- AI.SEARCH_EVAL, built by 06), and marks its run as promoted. The first
-- gated run then has a live model to beat. Last, it drops the old tables so
-- views can take their names. Once done, it does nothing.
EXECUTE IMMEDIATE $$
DECLARE
  v_type VARCHAR DEFAULT '';
  v_baseline VARCHAR DEFAULT 'baseline-before-gates';
BEGIN
  SELECT COALESCE(MAX(TABLE_TYPE), '') INTO :v_type
  FROM PICKTONIGHT.INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'AI' AND TABLE_NAME = 'TITLE_EMBEDDINGS';
  IF (v_type <> 'BASE TABLE') THEN
    RETURN 'Nothing to move: training is already gated.';
  END IF;

  -- All or nothing, so a failure cannot leave a half-copied baseline.
  BEGIN TRANSACTION;

  INSERT INTO PICKTONIGHT.AI.TITLE_EMBEDDINGS_HISTORY
    (RUN_ID, TITLE_KEY, MEDIA_TYPE, EMBEDDING, MODEL_VERSION, TRAINED_AT)
  SELECT :v_baseline, TITLE_KEY, MEDIA_TYPE, EMBEDDING, MODEL_VERSION, TRAINED_AT
  FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS;

  INSERT INTO PICKTONIGHT.AI.TITLE_MOODS_PREDICTED_HISTORY
    (RUN_ID, TITLE_KEY, MOOD, PROBABILITY, PREDICTED, RULE_LABEL, DISAGREEMENT, MODEL_VERSION)
  SELECT :v_baseline, TITLE_KEY, MOOD, PROBABILITY, PREDICTED, RULE_LABEL, DISAGREEMENT, MODEL_VERSION
  FROM PICKTONIGHT.AI.TITLE_MOODS_PREDICTED;

  INSERT INTO PICKTONIGHT.AI.MODEL_RUN_METRICS (RUN_ID, METRIC_NAME, SCOPE, METRIC_VALUE, MODEL_VERSION)
  SELECT :v_baseline, 'mood_precision', MOOD, PRECISION_SCORE, MODEL_VERSION FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
  UNION ALL
  SELECT :v_baseline, 'mood_recall', MOOD, RECALL_SCORE, MODEL_VERSION FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
  UNION ALL
  SELECT :v_baseline, 'mood_f1', MOOD, F1_SCORE, MODEL_VERSION FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
  UNION ALL
  SELECT :v_baseline, 'mood_rule_positives', MOOD, RULE_POSITIVES, MODEL_VERSION FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
  UNION ALL
  SELECT :v_baseline, 'mood_rule_positive_rate', MOOD, RULE_POSITIVE_RATE, MODEL_VERSION FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
  UNION ALL
  SELECT :v_baseline, 'search_precision_at_10', q.QUERY_ID, e.PRECISION_AT_10, 'title-models-v1'
  FROM PICKTONIGHT.AI.SEARCH_EVAL AS e
  JOIN PICKTONIGHT.DBT_SEEDS.SEARCH_EVAL_QUERIES AS q ON q.SEARCH_TEXT = e.SEARCH_TEXT
  UNION ALL
  SELECT :v_baseline, 'search_mean_precision_at_10', 'all', AVG(PRECISION_AT_10), 'title-models-v1'
  FROM PICKTONIGHT.AI.SEARCH_EVAL
  UNION ALL
  SELECT :v_baseline, 'search_min_precision_at_10', 'all', MIN(PRECISION_AT_10), 'title-models-v1'
  FROM PICKTONIGHT.AI.SEARCH_EVAL
  UNION ALL
  -- Whole-model numbers from the newest run summary, renamed to the metric
  -- names that gated runs use.
  SELECT
    :v_baseline,
    CASE f.KEY
      WHEN 'explained_variance' THEN 'embedding_explained_variance'
      WHEN 'vocabulary_size' THEN 'embedding_vocabulary_size'
      ELSE f.KEY
    END,
    'all',
    f.VALUE::FLOAT,
    r.SUMMARY:model_version::VARCHAR
  FROM (
    SELECT SUMMARY FROM PICKTONIGHT.AI.MODEL_RUNS
    WHERE RUN_ID IS NULL
    QUALIFY ROW_NUMBER() OVER (ORDER BY RUN_AT DESC) = 1
  ) AS r,
  LATERAL FLATTEN(INPUT => r.SUMMARY) AS f
  WHERE f.KEY IN ('mood_micro_f1', 'embedding_dimensions', 'explained_variance', 'vocabulary_size',
                  'titles_embedded', 'mood_titles', 'confident_disagreements');

  UPDATE PICKTONIGHT.AI.MODEL_RUNS
  SET RUN_ID = :v_baseline,
      STATUS = 'promoted',
      LINEAGE = OBJECT_CONSTRUCT(
        'note', 'The model that was live before quality gates existed. It stays live until a gated run beats it. Its training data was not recorded.'
      )
  WHERE RUN_ID IS NULL
    AND RUN_AT = (SELECT MAX(RUN_AT) FROM PICKTONIGHT.AI.MODEL_RUNS WHERE RUN_ID IS NULL);

  COMMIT;

  DROP TABLE PICKTONIGHT.AI.TITLE_EMBEDDINGS;
  DROP TABLE PICKTONIGHT.AI.TITLE_MOODS_PREDICTED;
  DROP TABLE PICKTONIGHT.AI.MOOD_MODEL_METRICS;
  RETURN 'Moved: the current model is now the first live run, baseline-before-gates.';
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    RAISE;
END;
$$;

-- Live views ---------------------------------------------------------------------
-- The live model is the newest promoted run. Promotion writes the run row
-- last, so these views switch to a new model in one step.
CREATE OR REPLACE VIEW PICKTONIGHT.AI.LIVE_MODEL_RUN
  COMMENT = 'The live model: the newest training run that passed every quality gate'
AS
SELECT RUN_ID, RUN_AT, SUMMARY, LINEAGE
FROM PICKTONIGHT.AI.MODEL_RUNS
WHERE STATUS = 'promoted'
QUALIFY ROW_NUMBER() OVER (ORDER BY RUN_AT DESC) = 1;

CREATE OR REPLACE VIEW PICKTONIGHT.AI.TITLE_EMBEDDINGS
  COMMENT = 'One 128-dimension vector per title, from the live model'
AS
SELECT h.TITLE_KEY, h.MEDIA_TYPE, h.EMBEDDING, h.MODEL_VERSION, h.TRAINED_AT, h.RUN_ID
FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS_HISTORY AS h
JOIN PICKTONIGHT.AI.LIVE_MODEL_RUN AS r ON r.RUN_ID = h.RUN_ID;

CREATE OR REPLACE VIEW PICKTONIGHT.AI.TITLE_MOODS_PREDICTED
  COMMENT = 'Out-of-fold mood probabilities, rule labels, and confident disagreements, from the live model'
AS
SELECT h.TITLE_KEY, h.MOOD, h.PROBABILITY, h.PREDICTED, h.RULE_LABEL, h.DISAGREEMENT, h.MODEL_VERSION, h.RUN_ID
FROM PICKTONIGHT.AI.TITLE_MOODS_PREDICTED_HISTORY AS h
JOIN PICKTONIGHT.AI.LIVE_MODEL_RUN AS r ON r.RUN_ID = h.RUN_ID;

CREATE OR REPLACE VIEW PICKTONIGHT.AI.MOOD_MODEL_METRICS
  COMMENT = '5-fold cross-validated precision, recall, and F1 per mood, for the live model'
AS
SELECT
  m.SCOPE                                                                   AS MOOD,
  MAX(IFF(m.METRIC_NAME = 'mood_precision', m.METRIC_VALUE, NULL))          AS PRECISION_SCORE,
  MAX(IFF(m.METRIC_NAME = 'mood_recall', m.METRIC_VALUE, NULL))             AS RECALL_SCORE,
  MAX(IFF(m.METRIC_NAME = 'mood_f1', m.METRIC_VALUE, NULL))                 AS F1_SCORE,
  MAX(IFF(m.METRIC_NAME = 'mood_rule_positives', m.METRIC_VALUE, NULL))::NUMBER AS RULE_POSITIVES,
  MAX(IFF(m.METRIC_NAME = 'mood_rule_positive_rate', m.METRIC_VALUE, NULL)) AS RULE_POSITIVE_RATE,
  ANY_VALUE(m.MODEL_VERSION)                                                AS MODEL_VERSION,
  ANY_VALUE(m.RUN_ID)                                                       AS RUN_ID
FROM PICKTONIGHT.AI.MODEL_RUN_METRICS AS m
JOIN PICKTONIGHT.AI.LIVE_MODEL_RUN AS r ON r.RUN_ID = m.RUN_ID
WHERE m.METRIC_NAME IN ('mood_precision', 'mood_recall', 'mood_f1', 'mood_rule_positives', 'mood_rule_positive_rate')
GROUP BY m.SCOPE;

-- dbt reads the run records and views as sources, and analysts read the
-- outputs. Replacing a view drops its grants, so grant again every time.
GRANT SELECT ON ALL TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL VIEWS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ENGINEER;
GRANT SELECT ON ALL TABLES IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON ALL VIEWS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA PICKTONIGHT.AI TO ROLE PICKTONIGHT_ANALYST;

-- Training procedure ----------------------------------------------------------
-- EXECUTE AS CALLER lets the procedure write the tables and the model file
-- with the caller's privileges. Snowflake requires it to be the last clause.
CREATE OR REPLACE PROCEDURE PICKTONIGHT.AI.TRAIN_TITLE_MODELS()
  RETURNS VARIANT
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  PACKAGES = ('snowflake-snowpark-python', 'scikit-learn', 'numpy', 'joblib')
  IMPORTS = ('@PICKTONIGHT.RAW.PICKTONIGHT_STAGE/title_models.py')
  HANDLER = 'title_models.train_procedure'
  COMMENT = 'Trains a candidate title model, checks it against the quality gates, and promotes it only if every gate passes'
  EXECUTE AS CALLER;

-- Returns a JSON summary: run_id, status (promoted or rejected), any failed
-- gates with reasons, and the main scores.
CALL PICKTONIGHT.AI.TRAIN_TITLE_MODELS();

-- Embedding UDF ---------------------------------------------------------------
-- Created after training because it imports the live model file. A rejected
-- run never replaces that file, so this always embeds with the live model.
CREATE OR REPLACE FUNCTION PICKTONIGHT.AI.EMBED_TEXT(input_text STRING)
  RETURNS ARRAY
  LANGUAGE PYTHON
  RUNTIME_VERSION = '3.11'
  COMMENT = 'Embeds text into the PickTonight title vector space, with the live model'
  IMPORTS = (
    '@PICKTONIGHT.RAW.PICKTONIGHT_STAGE/title_models.py',
    '@PICKTONIGHT.AI.MODEL_STAGE/title_embedder.joblib'
  )
  PACKAGES = ('scikit-learn', 'numpy', 'joblib')
  HANDLER = 'title_models.embed_text_udf';

-- Checks --------------------------------------------------------------------
-- Run All only shows the last result. To see any other check, click inside
-- it and press Run (or Ctrl+Enter) to run just that statement.

-- 1. Recent runs, newest first, with their verdicts.
SELECT
  run_at,
  run_id,
  status,
  summary:failed_gates                AS failed_gates,
  summary:mood_micro_f1               AS mood_micro_f1,
  summary:search_mean_precision_at_10 AS search_precision_at_10
FROM PICKTONIGHT.AI.MODEL_RUNS
ORDER BY run_at DESC
LIMIT 5;

-- 2. What the live model was trained on: data fingerprints, code checksum,
--    and library versions.
SELECT run_id, run_at, lineage:training_data AS training_data, lineage:code AS code, lineage:libraries AS libraries
FROM PICKTONIGHT.AI.LIVE_MODEL_RUN;

-- 3. Every title has a 128-dimension vector.
SELECT
  (SELECT COUNT(*) FROM PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT)  AS titles,
  COUNT(*)                                            AS embedded,
  ANY_VALUE(ARRAY_SIZE(embedding::ARRAY))             AS dimensions
FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS;

-- 4. The UDF returns a vector of the same size.
SELECT ARRAY_SIZE(PICKTONIGHT.AI.EMBED_TEXT('a cozy animated movie for a family night')) AS query_dimensions;

-- 5. How well title and overview text recover each genre-based mood
--    (5-fold cross-validation: every title is scored by a model that did
--    not train on it).
SELECT mood, precision_score, recall_score, f1_score, rule_positives, rule_positive_rate
FROM PICKTONIGHT.AI.MOOD_MODEL_METRICS
ORDER BY f1_score DESC;

-- 6. Where the text model and the genre rules disagree most confidently.
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

-- 7. Each gate's verdict for the newest run. Failures sort first. now_live
--    says whether that run is the live model, and live_code_sha256 should
--    match "sha256sum warehouse/snowpark/title_models.py" on your machine.
SELECT
  g.gate_id,
  g.passed,
  ROUND(g.metric_value, 4)          AS candidate,
  g.min_value                       AS floor,
  ROUND(g.live_value, 4)            AS live_before,
  g.max_drop,
  g.reason,
  n.status,
  n.run_id = l.run_id               AS now_live,
  l.lineage:code:sha256::VARCHAR    AS live_code_sha256
FROM (
  SELECT run_id, status FROM PICKTONIGHT.AI.MODEL_RUNS
  WHERE run_id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (ORDER BY run_at DESC) = 1
) AS n
JOIN PICKTONIGHT.AI.MODEL_GATE_RESULTS AS g ON g.run_id = n.run_id
CROSS JOIN PICKTONIGHT.AI.LIVE_MODEL_RUN AS l
ORDER BY g.passed, g.gate_id;
