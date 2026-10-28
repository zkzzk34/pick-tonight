-- Journey outcomes by requested mood.
-- Grain: one row per data origin and mood code. "none" means no mood was given.

select
    data_origin,
    coalesce(mood_code, 'none')                   as mood_code,
    count(*)                                      as journeys,
    round(avg(iff(chose_title, 1, 0)), 3)         as choose_rate,
    round(avg(items_rejected), 2)                 as avg_rejections,
    median(seconds_to_decision)                   as median_seconds_to_decision,
    round(avg(iff(ended_empty, 1, 0)), 3)         as empty_rate
from {{ ref('fct_recommendation_journeys') }}
group by all
