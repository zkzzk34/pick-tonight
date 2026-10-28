-- One row per normalized TMDB title, typed and renamed from the raw export.
-- Staging only casts, renames, and parses. Business rules live in the marts.
--
-- title_key is the app's own identity. TMDB IDs are only unique within a
-- media type, so movie 10 and tv 10 are different titles.
-- JSON keys keep the export's camelCase, because Snowflake paths are case-sensitive.

select
    raw:record:mediaType::string || ':' || raw:record:id::string  as title_key,
    raw:record:id::number                                         as tmdb_id,
    raw:record:mediaType::string                                  as media_type,
    raw:record:title::string                                      as title,
    raw:record:originalTitle::string                              as original_title,
    raw:record:overview::string                                   as overview,
    try_to_date(raw:record:releaseDate::string)                   as release_date,
    year(try_to_date(raw:record:releaseDate::string))             as release_year,
    raw:record:originalLanguage::string                           as original_language,
    raw:record:genreIds                                           as genre_ids,
    raw:record:posterPath::string                                 as poster_path,
    raw:record:popularity::float                                  as popularity,
    raw:record:voteAverage::float                                 as vote_average,
    raw:record:voteCount::number                                  as vote_count,
    raw:record:adult::boolean                                     as is_adult,
    raw:source_rank::number                                       as source_rank,
    raw:source_page::number                                       as source_page,
    raw:extracted_at::timestamp_tz                                as extracted_at,
    source_file,
    source_row,
    loaded_at
from {{ source('tmdb', 'tmdb_titles') }}
