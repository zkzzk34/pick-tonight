-- =============================================================================
-- 06_vector_search.sql
-- Similar-title and free-text search with native VECTOR similarity.
--
--   AI.SIMILAR_TITLES      top 5 nearest titles of the same media type
--   AI.SEARCH_TITLES(...)  table function: free-text query to ranked titles
--   AI.SEARCH_EVAL         genre precision@10 of the live search, for the
--                          test queries in DBT_SEEDS.SEARCH_EVAL_QUERIES
--
-- The embeddings come from the live model trained by 05_snowpark_ml.sql.
-- Similarity is cosine, computed by Snowflake's VECTOR_COSINE_SIMILARITY.
-- Title details come from DBT_MARTS.TITLE_CATALOG_CURRENT, built by dbt.
--
-- Training already scores the same test queries in Python before a model
-- can go live. This file scores the live search again in SQL, through the
-- real UDF and vector functions, and compares the two at the end.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE PICKTONIGHT_WH;
USE SCHEMA PICKTONIGHT.AI;
ALTER SESSION SET QUERY_TAG = 'picktonight:vector-search';

-- "More like this" ------------------------------------------------------------
-- Compares every pair of titles within a media type, about two million
-- similarity calls for the default catalog, and keeps the top five.
CREATE OR REPLACE TABLE PICKTONIGHT.AI.SIMILAR_TITLES AS
SELECT
  a.title_key,
  b.title_key                                         AS similar_title_key,
  VECTOR_COSINE_SIMILARITY(a.embedding, b.embedding)  AS similarity
FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS AS a
JOIN PICKTONIGHT.AI.TITLE_EMBEDDINGS AS b
  ON a.media_type = b.media_type
 AND a.title_key <> b.title_key
QUALIFY ROW_NUMBER() OVER (PARTITION BY a.title_key ORDER BY similarity DESC) <= 5;

-- Try it on the five most popular movies. Change the filter to any title.
SELECT
  seed.title                   AS because_you_liked,
  d.title                      AS recommended,
  d.release_year,
  d.genre_names_text,
  ROUND(s.similarity, 3)       AS similarity
FROM PICKTONIGHT.AI.SIMILAR_TITLES AS s
JOIN PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT AS seed ON seed.title_key = s.title_key
JOIN PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT AS d    ON d.title_key = s.similar_title_key
WHERE seed.media_type = 'movie'
  AND seed.popularity_rank <= 5
ORDER BY seed.popularity_rank, s.similarity DESC;

-- Free-text search ----------------------------------------------------------
-- The query is embedded once with AI.EMBED_TEXT, then compared to every title.
-- Pass NULL::STRING as media_type_filter to search movies and TV together.
-- A bare NULL has no type, so Snowflake cannot match it to this function.
-- The 128 must match the dimensions reported by AI.TRAIN_TITLE_MODELS().
CREATE OR REPLACE FUNCTION PICKTONIGHT.AI.SEARCH_TITLES(
  search_text STRING,
  media_type_filter STRING,
  result_limit NUMBER
)
RETURNS TABLE (
  title_key STRING,
  title STRING,
  media_type STRING,
  release_year NUMBER,
  genre_names_text STRING,
  score FLOAT
)
AS
$$
  WITH query_vector AS (
    SELECT PICKTONIGHT.AI.EMBED_TEXT(search_text)::VECTOR(FLOAT, 128) AS v
  )
  SELECT
    d.title_key,
    d.title,
    d.media_type,
    d.release_year,
    d.genre_names_text,
    VECTOR_COSINE_SIMILARITY(e.embedding, q.v) AS score
  FROM PICKTONIGHT.AI.TITLE_EMBEDDINGS AS e
  JOIN PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT AS d
    ON d.title_key = e.title_key
  CROSS JOIN query_vector AS q
  WHERE media_type_filter IS NULL
     OR d.media_type = media_type_filter
  QUALIFY ROW_NUMBER() OVER (ORDER BY score DESC) <= result_limit
$$;

SELECT * FROM TABLE(PICKTONIGHT.AI.SEARCH_TITLES('a cozy animated movie for a family night', 'movie', 10))
ORDER BY score DESC;

SELECT * FROM TABLE(PICKTONIGHT.AI.SEARCH_TITLES('a tense mystery with a twist nobody sees coming', NULL::STRING, 10))
ORDER BY score DESC;

-- Search evaluation ---------------------------------------------------------
-- Each test query describes a plot without naming its genre. A hit is a
-- top-10 title of the query's media type whose TMDB genres include the
-- expected genre. This is a rough relevance check, not a full benchmark,
-- but it is repeatable. The queries are a reviewed dbt seed, the same list
-- the training gate uses.
--
-- Step 1 embeds each test query once, into a temporary table. Inside one big
-- join, Snowflake's planner may call the Python UDF once per joined row
-- (every query x every title) instead of once per query. That wastes work
-- and exhausted the UDF's memory on an X-Small warehouse, so the join in
-- step 2 is plain SQL over vectors that already exist.
CREATE OR REPLACE TEMPORARY TABLE PICKTONIGHT.AI.SEARCH_EVAL_QUERIES AS
SELECT
  query_id,
  search_text,
  expected_genre,
  media_type,
  PICKTONIGHT.AI.EMBED_TEXT(search_text)::VECTOR(FLOAT, 128) AS v
FROM PICKTONIGHT.DBT_SEEDS.SEARCH_EVAL_QUERIES;

-- Step 2: compare every embedded query with every title of its media type
-- and keep the top ten.
CREATE OR REPLACE TABLE PICKTONIGHT.AI.SEARCH_EVAL AS
WITH top_ten AS (
  SELECT
    q.query_id,
    q.search_text,
    q.expected_genre,
    d.title,
    d.genre_names,
    VECTOR_COSINE_SIMILARITY(e.embedding, q.v) AS score
  FROM PICKTONIGHT.AI.SEARCH_EVAL_QUERIES AS q
  CROSS JOIN PICKTONIGHT.AI.TITLE_EMBEDDINGS AS e
  JOIN PICKTONIGHT.DBT_MARTS.TITLE_CATALOG_CURRENT AS d
    ON d.title_key = e.title_key
  WHERE d.media_type = q.media_type
  QUALIFY ROW_NUMBER() OVER (PARTITION BY q.query_id ORDER BY score DESC) <= 10
)
SELECT
  query_id,
  search_text,
  expected_genre,
  COUNT_IF(ARRAY_CONTAINS(expected_genre::VARIANT, genre_names)) AS hits,
  ROUND(hits / 10, 2)                                            AS precision_at_10,
  ARRAY_AGG(title) WITHIN GROUP (ORDER BY score DESC)            AS top_titles
FROM top_ten
GROUP BY query_id, search_text, expected_genre;

SELECT query_id, expected_genre, precision_at_10, top_titles
FROM PICKTONIGHT.AI.SEARCH_EVAL
ORDER BY precision_at_10 DESC;

-- The live search scored here in SQL, next to what the training gate
-- measured for the live model in Python. They should match. A gap of one
-- hit can come from float rounding when two titles nearly tie.
SELECT
  ROUND(AVG(e.precision_at_10), 4) AS sql_mean_precision_at_10,
  ROUND(ANY_VALUE(g.metric_value), 4) AS gate_mean_precision_at_10,
  ANY_VALUE(g.run_id)              AS live_run_id
FROM PICKTONIGHT.AI.SEARCH_EVAL AS e
CROSS JOIN (
  SELECT m.run_id, m.metric_value
  FROM PICKTONIGHT.AI.MODEL_RUN_METRICS AS m
  JOIN PICKTONIGHT.AI.LIVE_MODEL_RUN AS r ON r.run_id = m.run_id
  WHERE m.metric_name = 'search_mean_precision_at_10'
) AS g;
