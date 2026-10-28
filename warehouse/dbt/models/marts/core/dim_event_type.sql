-- Event type dimension, built from the reviewed event_taxonomy seed.
-- Grain: one row per event name in taxonomy v3, plus one default row.

select
    {{ dbt_utils.generate_surrogate_key(['event_name']) }} as event_type_key,
    event_name,
    event_group,
    funnel_step_order,
    funnel_step_order is not null                          as is_funnel_step,
    requires_recommendation_scope,
    requires_recommendation_item,
    description,
    false                                                  as is_default_row
from {{ ref('event_taxonomy') }}

union all

-- Default row for an event name outside the taxonomy. The taxonomy test
-- should keep this row unused.
select
    '-1', 'unknown', 'unknown', null, false, false, false,
    'Event name not in the reviewed taxonomy', true
