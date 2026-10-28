-- Migration parity: every dbt staging view must return exactly the same rows
-- as the hand-written view it replaces from 02_staging.sql.
--
-- HASH_AGG(*) is an order-independent fingerprint of every column of every
-- row. Equal row counts and equal fingerprints mean identical contents, so
-- this test also catches a changed type or a reordered column.
-- It returns one row per mismatched pair. Zero rows means a pass.

{% set pairs = [
    ('stg_tmdb__titles', 'stg_titles'),
    ('stg_tmdb__title_genres', 'stg_title_genres'),
    ('stg_tmdb__genres', 'stg_genres'),
    ('stg_app_config__mood_rules', 'stg_mood_rules'),
    ('stg_analytics__events', 'stg_events'),
] %}

with comparison as (

    {% for dbt_model, legacy_view in pairs %}
    select
        '{{ dbt_model }}'                                                  as dbt_model,
        '{{ legacy_view }}'                                                as legacy_view,
        (select count(*) from {{ ref(dbt_model) }})                        as dbt_rows,
        (select count(*) from {{ source('legacy_staging', legacy_view) }}) as legacy_rows,
        (select hash_agg(*) from {{ ref(dbt_model) }})                     as dbt_fingerprint,
        (select hash_agg(*) from {{ source('legacy_staging', legacy_view) }}) as legacy_fingerprint
    {% if not loop.last %}union all{% endif %}
    {% endfor %}

)

select *
from comparison
where dbt_rows <> legacy_rows
   or dbt_fingerprint <> legacy_fingerprint
