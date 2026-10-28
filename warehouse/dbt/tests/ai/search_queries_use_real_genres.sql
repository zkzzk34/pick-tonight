-- Every search test query expects a genre that TMDB really has for the
-- query's media type. A typo would make that query score zero on every
-- run, and the search gate would quietly measure nothing.
-- Returns one row per query with an unknown genre. Zero rows means a pass.

select
    q.query_id,
    q.media_type,
    q.expected_genre
from {{ ref('search_eval_queries') }} as q
left join {{ ref('stg_tmdb__genres') }} as g
    on g.media_type = q.media_type
   and g.genre_name = q.expected_genre
where g.genre_name is null
