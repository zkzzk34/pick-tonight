-- AI quality: the live model was trained on the data the marts hold now.
--
-- Training saves fingerprints of its inputs in LINEAGE. This test computes
-- the same fingerprints on the current marts. The column lists must match
-- CATALOG_FINGERPRINT_COLUMNS and RULE_MOODS_FINGERPRINT_COLUMNS in
-- warehouse/snowpark/title_models.py.
--
-- A warning, not an error: after a catalog reload the marts change before
-- anyone retrains, and the live model keeps working meanwhile. The message
-- says what to do. It also warns for the baseline model from before gates,
-- whose training data was never recorded.
-- Returns one row per problem. Zero rows means a pass.

with live as (

    select
        run_id,
        lineage:training_data:catalog:fingerprint::varchar    as catalog_fingerprint,
        lineage:training_data:rule_moods:fingerprint::varchar as rule_moods_fingerprint
    from {{ source('ai', 'live_model_run') }}

),

current_catalog as (

    select to_varchar(hash_agg(title_key, media_type, title, overview, search_document, genre_names)) as fingerprint
    from {{ ref('title_catalog_current') }}

),

current_rule_moods as (

    select to_varchar(hash_agg(title_key, mood)) as fingerprint
    from {{ ref('title_rule_moods') }}

),

missing_embeddings as (

    select count(*) as titles
    from {{ ref('title_catalog_current') }} as c
    left join {{ source('ai', 'title_embeddings') }} as e
        on e.title_key = c.title_key
    where e.title_key is null

)

select
    live.run_id,
    'catalog' as input,
    'The catalog changed after the live model was trained. Retrain with 05_snowpark_ml.sql.' as problem
from live
cross join current_catalog
where live.catalog_fingerprint is distinct from current_catalog.fingerprint

union all

select
    live.run_id,
    'rule moods',
    'The mood rules changed after the live model was trained. Retrain with 05_snowpark_ml.sql.'
from live
cross join current_rule_moods
where live.rule_moods_fingerprint is distinct from current_rule_moods.fingerprint

union all

select
    live.run_id,
    'embeddings',
    missing_embeddings.titles || ' catalog titles have no live embedding. Retrain with 05_snowpark_ml.sql.'
from live
cross join missing_embeddings
where missing_embeddings.titles > 0
