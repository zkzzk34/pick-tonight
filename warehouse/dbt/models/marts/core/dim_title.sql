-- Title dimension with type 2 history.
-- Grain: one row per version of a title, plus one default row.
--
-- title_version_key is the surrogate key facts join to. It is a hash of the
-- natural key and the version start time, so rebuilding the table always
-- produces the same keys. title_key stays as the durable natural key that
-- ties all versions of one title together.
--
-- valid_from is when a version started and valid_to is when it ended, both
-- as UTC TIMESTAMP_NTZ. The current version ends on 9999-12-31 instead of
-- null, so a point-in-time join is always "valid_from <= time < valid_to".

with versions as (

    select
        *,
        row_number() over (partition by title_key order by dbt_valid_from) as version_number
    from {{ ref('snap_title_attributes') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['title_key', 'dbt_valid_from']) }} as title_version_key,
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
    version_number,
    dbt_valid_from                                       as valid_from,
    coalesce(dbt_valid_to, '9999-12-31'::timestamp_ntz)  as valid_to,
    dbt_valid_to is null                                 as is_current,
    false                                                as is_default_row
from versions

union all

-- Default row: a fact whose title cannot be matched points here instead of
-- holding a null key, so joins never silently drop rows.
select
    '-1'                                    as title_version_key,
    'unknown'                               as title_key,
    null                                    as tmdb_id,
    'unknown'                               as media_type,
    'Unknown title'                         as title,
    null                                    as original_title,
    null                                    as overview,
    null                                    as release_date,
    null                                    as release_year,
    null                                    as original_language,
    array_construct()                       as genre_names,
    ''                                      as genre_names_text,
    'unknown'                               as rating_confidence,
    null                                    as search_document,
    1                                       as version_number,
    '1900-01-01'::timestamp_ntz             as valid_from,
    '9999-12-31'::timestamp_ntz             as valid_to,
    true                                    as is_current,
    true                                    as is_default_row
