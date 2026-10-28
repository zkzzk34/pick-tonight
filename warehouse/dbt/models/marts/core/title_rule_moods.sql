-- Moods the app's rule mapping gives each title.
-- Grain: one row per title and mood.
--
-- A title gets a mood when any of its genres is a genre signal for that mood
-- and media type. "surprised" is a discovery signal, not a genre rule, so it
-- never appears here. The ML steps compare these rule moods with what the
-- title's own text suggests.

select
    b.title_key,
    r.mood,
    r.mood_mapping_version,
    -- Sorted, so the same input always gives the same array.
    array_agg(distinct r.genre_name) within group (order by r.genre_name) as matched_genres
from {{ ref('bridge_title_genre') }} as b
inner join {{ ref('stg_app_config__mood_rules') }} as r
    on r.signal_kind = 'genre'
   and r.genre_id = b.genre_id
   and r.media_type = b.media_type
group by b.title_key, r.mood, r.mood_mapping_version
