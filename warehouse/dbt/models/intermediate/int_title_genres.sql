-- One row per title and genre, with the genre name resolved.
-- Genre IDs are scoped to a media type, so the join uses both columns.
-- A left join keeps genre IDs that have no name, so a test can count them.

select
    tg.title_key,
    tg.media_type,
    tg.genre_id,
    g.genre_name,
    tg.genre_position
from {{ ref('stg_tmdb__title_genres') }} as tg
left join {{ ref('stg_tmdb__genres') }} as g
    on g.media_type = tg.media_type
   and g.genre_id = tg.genre_id
