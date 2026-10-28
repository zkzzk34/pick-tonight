-- The input to the title history snapshot: only the attributes that change
-- slowly and are worth keeping history for.
--
-- Popularity, votes, and rank change on nearly every export. Keeping them
-- here would create a new title version every time, so they live in
-- fct_title_popularity instead.
--
-- extracted_at_utc is the time each new version starts. It is stored as UTC
-- TIMESTAMP_NTZ, the same type dbt-snowflake uses for its own snapshot clock,
-- so the snapshot never mixes zoned and unzoned timestamps.

select
    title_key,
    tmdb_id,
    media_type,
    title,
    original_title,
    overview,
    release_date,
    release_year,
    original_language,
    genre_names,
    genre_names_text,
    rating_confidence,
    search_document,
    convert_timezone('UTC', extracted_at)::timestamp_ntz as extracted_at_utc
from {{ ref('int_titles__enriched') }}
