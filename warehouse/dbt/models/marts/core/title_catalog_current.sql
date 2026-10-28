-- The title catalog as it is now.
-- Grain: one row per title in the latest catalog export.
--
-- This is the output port for the AI consumers: the Snowpark training
-- procedure (05_snowpark_ml.sql) and vector search (06_vector_search.sql)
-- read it. It is assembled from the star schema: the latest export's rows in
-- fct_title_popularity, joined to the dim_title version each row points to.
--
-- It has exactly the columns of the original MARTS.DIM_TITLE, and the parity
-- test checks the rows match. So the star can always rebuild the flat table
-- the models were first trained on.
-- Titles that dropped out of the latest export keep their history in
-- dim_title but are not part of the current catalog.

with latest_export as (

    select *
    from {{ ref('fct_title_popularity') }}
    where extracted_at = (select max(extracted_at) from {{ ref('fct_title_popularity') }})

)

select
    t.title_key,
    t.tmdb_id,
    t.media_type,
    t.title,
    t.original_title,
    t.overview,
    t.release_date,
    t.release_year,
    t.original_language,
    t.genre_names,
    t.genre_names_text,
    p.popularity,
    p.vote_average,
    p.vote_count,
    t.rating_confidence,
    p.popularity_rank,
    t.search_document,
    p.extracted_at,
    p.loaded_at
from latest_export as p
-- title_version_key already points to the version that was true at this
-- export, so no date logic is needed here.
inner join {{ ref('dim_title') }} as t
    on t.title_version_key = p.title_version_key
