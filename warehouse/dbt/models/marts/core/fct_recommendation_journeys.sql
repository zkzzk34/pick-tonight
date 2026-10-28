-- Recommendation journey fact table.
-- Grain: one row per recommendation journey, from context submission to a
-- choice, an empty result, an error, or leaving.
--
-- This is an accumulating snapshot fact: one row per process, with counts
-- and timestamps for its milestones. The journey columns reproduce the
-- original MARTS.FCT_RECOMMENDATION_JOURNEYS. The keys are added on top.

with journeys as (

    select
        recommendation_session_id,
        any_value(data_origin)                                          as data_origin,
        any_value(algorithm_version)                                    as algorithm_version,
        min(iff(event_name = 'context_submitted', event_at, null))      as submitted_at,
        max(iff(event_name = 'context_submitted', mood_code, null))     as mood_code,
        max(iff(event_name = 'context_submitted', media_type_code, null)) as media_type_code,
        max(iff(event_name = 'context_submitted', companion_code, null))  as companion_code,
        max(iff(event_name = 'context_submitted', used_typed_input, null)) as used_typed_input,
        count_if(event_name = 'recommendation_item_shown')              as items_shown,
        count_if(event_name = 'recommendation_opened')                  as items_opened,
        count_if(event_name = 'trailer_clicked')                        as trailers_clicked,
        count_if(event_name = 'recommendation_saved')                   as items_saved,
        count_if(event_name = 'recommendation_rejected')                as items_rejected,
        count_if(event_name = 'recommendations_refreshed')              as items_refreshed,
        count_if(event_name = 'recommendation_empty_shown') > 0         as ended_empty,
        count_if(event_name = 'api_error_shown') > 0                    as ended_with_error,
        min(iff(event_name = 'watch_intent_confirmed', event_at, null)) as chosen_at,
        chosen_at is not null                                           as chose_title,
        datediff('second', submitted_at, chosen_at)                     as seconds_to_decision
    from {{ ref('fct_events') }}
    where recommendation_session_id is not null
    group by recommendation_session_id

)

select
    {{ dbt_utils.generate_surrogate_key(['j.recommendation_session_id']) }} as journey_key,
    coalesce(d.date_key, -1)                                               as submitted_date_key,
    case
        when j.mood_code is null then '-2'
        else coalesce(m.mood_key, '-1')
    end                                                                    as mood_key,
    j.*
from journeys as j
left join {{ ref('dim_date') }} as d
    on d.date_day = to_date(j.submitted_at)
left join {{ ref('dim_mood') }} as m
    on m.mood_code = j.mood_code
   and not m.is_default_row
