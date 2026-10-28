-- Daily picker funnel: distinct page sessions reaching each step.
-- Grain: one row per event date and data origin.
-- The five steps match funnel_step_order 1 to 5 in the event_taxonomy seed.

select
    event_date,
    data_origin,
    count(distinct iff(event_name = 'app_opened', session_id, null))                  as sessions_opened,
    count(distinct iff(event_name = 'picker_started', session_id, null))              as sessions_started_picker,
    count(distinct iff(event_name = 'context_submitted', session_id, null))           as sessions_submitted,
    count(distinct iff(event_name = 'recommendation_batch_viewed', session_id, null)) as sessions_saw_picks,
    count(distinct iff(event_name = 'watch_intent_confirmed', session_id, null))      as sessions_chose,
    round(div0(sessions_started_picker, sessions_opened), 3)                          as start_rate,
    round(div0(sessions_submitted, sessions_started_picker), 3)                       as submit_rate,
    round(div0(sessions_chose, sessions_saw_picks), 3)                                as choose_rate
from {{ ref('fct_events') }}
group by event_date, data_origin
