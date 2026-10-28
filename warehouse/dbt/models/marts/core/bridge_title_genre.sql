-- Bridge between titles and genres.
-- Grain: one row per title and genre. A title can have several genres, so
-- this many-to-many link lives in its own table instead of in dim_title.
-- It links on the durable title_key, so it applies to every title version.

select
    title_key,
    media_type,
    genre_id,
    genre_name,
    genre_position
from {{ ref('int_title_genres') }}
