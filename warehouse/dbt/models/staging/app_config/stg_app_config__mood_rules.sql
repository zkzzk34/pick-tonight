-- The app's mood mapping, one row per mood, signal, and media type.
-- A genre signal that applies to movies and TV becomes two rows, so the marts
-- can join on media_type and genre_id directly.
-- "surprised" uses a discovery signal instead of genres, so its genre columns are null.

select
    r.raw:mood_mapping_version::string as mood_mapping_version,
    r.raw:mood::string                 as mood,
    r.raw:intent::string               as mood_intent,
    r.raw:signal_kind::string          as signal_kind,
    r.raw:genre_id::number             as genre_id,
    r.raw:genre_name::string           as genre_name,
    m.value::string                    as media_type
from {{ source('app_config', 'mood_genre_rules') }} as r,
    lateral flatten(input => r.raw:media_types) as m
