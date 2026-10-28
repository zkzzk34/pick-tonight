-- TMDB genre reference data. Genre IDs are scoped to a media type, so the
-- key is media_type plus genre_id.

select
    raw:media_type::string         as media_type,
    raw:genre_id::number           as genre_id,
    raw:genre_name::string         as genre_name,
    raw:extracted_at::timestamp_tz as extracted_at
from {{ source('tmdb', 'tmdb_genres') }}
