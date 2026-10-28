-- Event fact table.
-- Grain: one row per analytics event that parsed cleanly.
--
-- Foreign keys point to dim_date, dim_event_type, and dim_mood. Each key
-- falls back to that dimension's default row instead of null, so a join to
-- any dimension keeps every event.
--
-- The natural codes (event_name, event_date, mood_code) stay next to the
-- keys. That keeps simple questions simple and lets the parity test compare
-- this table with the original MARTS.FCT_EVENTS column for column.
-- Events never carry a title ID, by privacy design, so there is no title key.

with events as (

    select *
    from {{ ref('stg_analytics__events') }}
    -- Rows that fail parsing stay out of the fact table. Tests count them in staging.
    where event_at is not null
      and properties is not null
    qualify row_number() over (partition by event_uuid order by loaded_at) = 1

)

select
    e.event_uuid,
    coalesce(d.date_key, -1)                       as date_key,
    coalesce(et.event_type_key, '-1')              as event_type_key,
    case
        when e.mood_code is null then '-2'
        else coalesce(m.mood_key, '-1')
    end                                            as mood_key,
    e.event_name,
    e.event_at,
    e.event_date,
    e.data_origin,
    e.distinct_id,
    e.session_id,
    e.recommendation_session_id,
    e.recommendation_item_id,
    e.algorithm_version,
    e.analytics_environment,
    e.traffic_class,
    e.media_type,
    e.position,
    e.batch_sequence,
    e.mood_code,
    e.media_type_code,
    e.companion_code,
    e.used_typed_input,
    e.required_restriction_count,
    e.rejection_reason,
    e.feedback_reason,
    e.error_kind,
    e.candidate_age_code,
    e.rating_confidence_code,
    e.properties,
    e.source_file,
    e.loaded_at
from events as e
left join {{ ref('dim_date') }} as d
    on d.date_day = e.event_date
left join {{ ref('dim_event_type') }} as et
    on et.event_name = e.event_name
   and not et.is_default_row
left join {{ ref('dim_mood') }} as m
    on m.mood_code = e.mood_code
   and not m.is_default_row
