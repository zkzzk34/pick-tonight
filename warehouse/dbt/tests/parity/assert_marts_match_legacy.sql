-- Migration parity for the marts: each dbt model must hold the same rows as
-- the table it replaces from 03_marts.sql, on the columns they share.
--
-- The old flat DIM_TITLE is compared with title_catalog_current, which is
-- rebuilt from the star schema. That shows the star loses nothing.
-- The dbt facts add surrogate keys, so the comparison lists the original
-- columns explicitly. Two deliberate differences are left out:
--   loaded_at       differs if RAW was reloaded after 03_marts.sql last ran
--   matched_genres  the dbt version sorts the array, so both sides are
--                   sorted before comparing
-- It returns one row per mismatched pair. Zero rows means a pass.

{% set title_columns = 'title_key, tmdb_id, media_type, title, original_title, overview, release_date, release_year, original_language, genre_names, genre_names_text, popularity, vote_average, vote_count, rating_confidence, popularity_rank, search_document, extracted_at' %}

{% set event_columns = 'event_uuid, event_name, event_at, event_date, data_origin, distinct_id, session_id, recommendation_session_id, recommendation_item_id, algorithm_version, analytics_environment, traffic_class, media_type, position, batch_sequence, mood_code, media_type_code, companion_code, used_typed_input, required_restriction_count, rejection_reason, feedback_reason, error_kind, candidate_age_code, rating_confidence_code, properties, source_file' %}

{% set journey_columns = 'recommendation_session_id, data_origin, algorithm_version, submitted_at, mood_code, media_type_code, companion_code, used_typed_input, items_shown, items_opened, trailers_clicked, items_saved, items_rejected, items_refreshed, ended_empty, ended_with_error, chosen_at, chose_title, seconds_to_decision' %}

{% set pairs = [
    ('title_catalog_current', 'dim_title', title_columns),
    ('bridge_title_genre', 'bridge_title_genre', 'title_key, media_type, genre_id, genre_name, genre_position'),
    ('title_rule_moods', 'title_rule_moods', 'title_key, mood, mood_mapping_version, array_sort(matched_genres)'),
    ('fct_events', 'fct_events', event_columns),
    ('fct_recommendation_journeys', 'fct_recommendation_journeys', journey_columns),
    ('agg_picker_funnel_daily', 'agg_picker_funnel_daily', '*'),
    ('agg_mood_outcomes', 'agg_mood_outcomes', '*'),
] %}

with comparison as (

    {% for dbt_model, legacy_table, columns in pairs %}
    select
        '{{ dbt_model }}'                                                          as dbt_model,
        '{{ legacy_table }}'                                                       as legacy_table,
        (select count(*) from {{ ref(dbt_model) }})                                as dbt_rows,
        (select count(*) from {{ source('legacy_marts', legacy_table) }})          as legacy_rows,
        (select hash_agg({{ columns }}) from {{ ref(dbt_model) }})                 as dbt_fingerprint,
        (select hash_agg({{ columns }}) from {{ source('legacy_marts', legacy_table) }}) as legacy_fingerprint
    {% if not loop.last %}union all{% endif %}
    {% endfor %}

)

select *
from comparison
where dbt_rows <> legacy_rows
   or dbt_fingerprint <> legacy_fingerprint
