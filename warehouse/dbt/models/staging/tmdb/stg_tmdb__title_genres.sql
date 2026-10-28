-- One row per title and genre ID, flattened from each title's genreIds array.
-- genre_position keeps TMDB's order, which the marts use to list genre names.

select
    t.title_key,
    t.media_type,
    g.value::number as genre_id,
    g.index         as genre_position
from {{ ref('stg_tmdb__titles') }} as t,
    lateral flatten(input => t.genre_ids) as g
