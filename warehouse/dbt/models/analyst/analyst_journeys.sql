-- Secure view of the journey fact for the analyst role.
-- Grain: one row per recommendation journey, the same as
-- fct_recommendation_journeys.
--
-- Analysts get no grant on the fact table itself. The journey ID is hashed
-- by the tag-based masking policy, with the same hash as in analyst_events,
-- so journeys still join to their events.

select
    journey_key,
    submitted_date_key,
    mood_key,
    recommendation_session_id,
    data_origin,
    algorithm_version,
    submitted_at,
    mood_code,
    media_type_code,
    companion_code,
    used_typed_input,
    items_shown,
    items_opened,
    trailers_clicked,
    items_saved,
    items_rejected,
    items_refreshed,
    ended_empty,
    ended_with_error,
    chosen_at,
    chose_title,
    seconds_to_decision
from {{ ref('fct_recommendation_journeys') }}
