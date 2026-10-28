-- Recommendation events must carry a journey ID and an algorithm version.
--
-- Which events count as recommendation events comes from the reviewed
-- event_taxonomy seed, not from a list typed into this test. Adding an event
-- to the taxonomy automatically brings it under this check.
-- Returns one row per offending event. Zero rows means a pass.

select
    e.event_uuid,
    e.event_name,
    e.recommendation_session_id is null as missing_journey_id,
    e.algorithm_version is null         as missing_algorithm_version
from {{ ref('stg_analytics__events') }} as e
inner join {{ ref('event_taxonomy') }} as t
    on t.event_name = e.event_name
where t.requires_recommendation_scope
  and (e.recommendation_session_id is null or e.algorithm_version is null)
