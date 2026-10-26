-- =============================================================================
-- 06_vector_search.sql
-- Similar-title and free-text search with native VECTOR similarity.
--
--   AI.SIMILAR_TITLES      top 5 nearest titles of the same media type
--   AI.SEARCH_TITLES(...)  table function: free-text query to ranked titles
--   AI.SEARCH_EVAL         genre precision@10 for a fixed set of test queries
--
-- The embeddings come from 05_snowpark_ml.sql. Similarity is cosine, computed
-- by Snowflake's VECTOR_COSINE_SIMILARITY.
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
JOIN PICKTONIGHT.MARTS.DIM_TITLE AS seed ON seed.title_key = s.title_key
JOIN PICKTONIGHT.MARTS.DIM_TITLE AS d    ON d.title_key = s.similar_title_key
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
  JOIN PICKTONIGHT.MARTS.DIM_TITLE AS d
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
-- Each test query describes a plot without naming its genre. A hit is a top-10
-- movie whose TMDB genres include the expected genre. This is a rough
-- relevance check, not a full benchmark, but it is repeatable after retraining.
CREATE OR REPLACE TABLE PICKTONIGHT.AI.SEARCH_EVAL AS
WITH test_queries AS (
  SELECT column1 AS search_text, column2 AS expected_genre
  FROM VALUES
    ('a ghost haunts a family after they move into an old house', 'Horror'),
    ('two strangers slowly fall in love over one summer', 'Romance'),
    ('a detective hunts a killer through the city', 'Crime'),
    ('astronauts travel to a distant planet to save humanity', 'Science Fiction'),
    ('a talking animal and its friends go on a colorful journey', 'Animation'),
    ('soldiers fight to survive on the front lines', 'War'),
    ('friends get into ridiculous trouble during a wild weekend', 'Comedy'),
    ('a superhero battles a villain to save the world', 'Action')
),
query_vectors AS (
  SELECT
    search_text,
    expected_genre,
    PICKTONIGHT.AI.EMBED_TEXT(search_text)::VECTOR(FLOAT, 128) AS v
  FROM test_queries
),
top_ten AS (
  SELECT
    q.search_text,
    q.expected_genre,
    d.title,
    d.genre_names,
    VECTOR_COSINE_SIMILARITY(e.embedding, q.v) AS score
  FROM query_vectors AS q
  CROSS JOIN PICKTONIGHT.AI.TITLE_EMBEDDINGS AS e
  JOIN PICKTONIGHT.MARTS.DIM_TITLE AS d
    ON d.title_key = e.title_key
  WHERE d.media_type = 'movie'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY q.search_text ORDER BY score DESC) <= 10
)
SELECT
  search_text,
  expected_genre,
  COUNT_IF(ARRAY_CONTAINS(expected_genre::VARIANT, genre_names)) AS hits,
  ROUND(hits / 10, 2)                                            AS precision_at_10,
  ARRAY_AGG(title) WITHIN GROUP (ORDER BY score DESC)            AS top_titles
FROM top_ten
GROUP BY search_text, expected_genre;

SELECT search_text, expected_genre, precision_at_10, top_titles
FROM PICKTONIGHT.AI.SEARCH_EVAL
ORDER BY precision_at_10 DESC;

-- One number for the whole evaluation.
SELECT ROUND(AVG(precision_at_10), 2) AS mean_genre_precision_at_10
FROM PICKTONIGHT.AI.SEARCH_EVAL;
