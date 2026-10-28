-- Current state of every title in the latest export, one row per title,
-- with the derived fields the marts and the ML steps need. This reproduces
-- the original MARTS.DIM_TITLE exactly, which the parity test checks.
--
-- Two marts read from here:
--   int_title_attributes -> the history snapshot -> dim_title
--   fct_title_popularity, which keeps the fast-changing numbers per export

with genre_lists as (

    select
        title_key,
        array_agg(genre_name) within group (order by genre_position) as genre_names
    from {{ ref('int_title_genres') }}
    where genre_name is not null
    group by title_key

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
    coalesce(gl.genre_names, array_construct())          as genre_names,
    array_to_string(coalesce(gl.genre_names, array_construct()), ', ')
                                                         as genre_names_text,
    t.popularity,
    t.vote_average,
    t.vote_count,
    -- Mirrors ratingConfidence() in src/server/recommendation-engine.ts:
    -- no rating or up to 24 votes is limited, and up to 99 votes is medium.
    -- A title released 0 to 180 days ago is strong from 100 votes, while
    -- older, future, or undated titles need 500. The unit test
    -- rating_confidence_follows_app_rules checks every boundary.
    case
        when t.vote_average is null or coalesce(t.vote_count, 0) <= 24 then 'limited'
        when t.vote_count <= 99 then 'medium'
        when datediff('day', t.release_date, to_date(t.extracted_at)) between 0 and 180 then 'strong'
        when t.vote_count < 500 then 'medium'
        else 'strong'
    end                                                  as rating_confidence,
    t.source_rank                                        as popularity_rank,
    t.title
        || ' (' || iff(t.media_type = 'movie', 'movie', 'TV series')
        || coalesce(', ' || t.release_year, '') || '). '
        || coalesce('Genres: ' || nullif(genre_names_text, '') || '. ', '')
        || coalesce(t.overview, '')                      as search_document,
    t.extracted_at,
    t.loaded_at
from {{ ref('stg_tmdb__titles') }} as t
left join genre_lists as gl
    on gl.title_key = t.title_key
-- The export already removes duplicates. This keeps the key unique even if
-- the same file were staged twice.
qualify row_number() over (partition by t.title_key order by t.source_rank) = 1
