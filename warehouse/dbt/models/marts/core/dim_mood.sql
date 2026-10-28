-- Mood dimension, built from the app's mood mapping.
-- Grain: one row per supported mood, plus two default rows.
--
-- The two default rows mean different things:
--   -1  unknown: the event carried a mood code that is not in the mapping
--   -2  not specified: the event carried no mood at all, which is normal for
--       every event except context_submitted, and for users who skip the mood

with moods as (

    select
        mood,
        any_value(mood_intent)              as mood_intent,
        any_value(mood_mapping_version)     as mood_mapping_version,
        count_if(signal_kind = 'genre') > 0 as uses_genre_signals
    from {{ ref('stg_app_config__mood_rules') }}
    group by mood

)

select
    {{ dbt_utils.generate_surrogate_key(['mood']) }} as mood_key,
    mood                                             as mood_code,
    mood_intent,
    uses_genre_signals,
    mood_mapping_version,
    false                                            as is_default_row
from moods

union all

select '-1', 'unknown', 'Mood code not in the app mood mapping', false, null, true

union all

select '-2', 'not_specified', 'No mood was given', false, null, true
