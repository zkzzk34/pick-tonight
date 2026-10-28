-- Secure view of the event fact for the analyst role.
-- Grain: one row per analytics event, the same as fct_events.
--
-- Analysts get no grant on fct_events itself. This view is their only path
-- to event rows, and it leaves out what they do not need: the raw properties
-- JSON and the file lineage columns. The pseudonymous ID columns stay, and
-- the tag-based masking policy on fct_events hashes them for anyone who is
-- not an engineer, even through this view.
--
-- Secure, so the view definition is hidden from consumers and Snowflake will
-- not use optimizations that could expose filtered-out data.

select
    event_uuid,
    date_key,
    event_type_key,
    mood_key,
    event_name,
    event_at,
    event_date,
    data_origin,
    distinct_id,
    session_id,
    recommendation_session_id,
    recommendation_item_id,
    algorithm_version,
    analytics_environment,
    traffic_class,
    media_type,
    position,
    batch_sequence,
    mood_code,
    media_type_code,
    companion_code,
    used_typed_input,
    required_restriction_count,
    rejection_reason,
    feedback_reason,
    error_kind,
    candidate_age_code,
    rating_confidence_code
from {{ ref('fct_events') }}
