-- Title popularity fact table.
-- Grain: one row per title per catalog export.
--
-- This is a periodic snapshot fact. Popularity, votes, and rank change on
-- every export, so they are measured here over time instead of creating a
-- new title version each time.
--
-- It is incremental. RAW only holds the latest export, so each run appends
-- the rows from any export newer than the newest one already stored. Older
-- exports stay in this table even after RAW is reloaded.
--
-- full_refresh is off for the same reason: rebuilding from RAW would keep
-- only the latest export and silently delete the rest of the history.
--
-- title_version_key points to the dim_title version that was true when the
-- export was taken. That is a point-in-time join on the version's validity
-- range, compared in UTC because dim_title stores its validity range in UTC.

{{ config(
    materialized='incremental',
    unique_key=['title_key', 'extracted_at'],
    incremental_strategy='merge',
    on_schema_change='fail',
    full_refresh=false
) }}

with exported as (

    select
        title_key,
        extracted_at,
        popularity,
        popularity_rank,
        vote_average,
        vote_count,
        loaded_at,
        convert_timezone('UTC', extracted_at)::timestamp_ntz as extracted_at_utc
    from {{ ref('int_titles__enriched') }}
    {% if is_incremental() %}
    where extracted_at > (select max(extracted_at) from {{ this }})
    {% endif %}

)

select
    {{ dbt_utils.generate_surrogate_key(['e.title_key', 'e.extracted_at']) }} as title_popularity_key,
    coalesce(t.title_version_key, '-1')                                       as title_version_key,
    coalesce(d.date_key, -1)                                                  as export_date_key,
    e.title_key,
    e.extracted_at,
    e.popularity,
    e.popularity_rank,
    e.vote_average,
    e.vote_count,
    e.loaded_at
from exported as e
left join {{ ref('dim_title') }} as t
    on t.title_key = e.title_key
   and e.extracted_at_utc >= t.valid_from
   and e.extracted_at_utc < t.valid_to
   and not t.is_default_row
left join {{ ref('dim_date') }} as d
    on d.date_day = to_date(e.extracted_at)
