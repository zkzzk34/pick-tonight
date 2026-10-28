-- Analytics events with taxonomy v3 properties pulled into typed columns.
--
-- data_origin comes from the file name, so synthetic rows can always be
-- separated from the real internal-traffic export.
-- Rows that fail parsing stay here with nulls. The marts filter them out and
-- the tests count them.

with parsed as (

    select
        *,
        try_parse_json(properties_text) as properties,
        -- PostHog exports '2026-09-21 20:17:59.906000+00:00', while the
        -- synthetic file uses ISO 8601 with a Z. Try automatic detection
        -- first, then PostHog's format.
        coalesce(
            try_to_timestamp_tz(event_timestamp_text),
            try_to_timestamp_tz(event_timestamp_text, 'YYYY-MM-DD HH24:MI:SS.FF6TZH:TZM')
        ) as event_at
    from {{ source('analytics', 'events') }}

)

select
    event_uuid,
    event_name,
    event_at,
    to_date(event_at)                                as event_date,
    distinct_id,
    iff(contains(lower(source_file), 'synthetic'), 'synthetic', 'posthog_internal')
                                                     as data_origin,
    properties:taxonomy_version::number              as taxonomy_version,
    properties:analytics_environment::string         as analytics_environment,
    properties:traffic_class::string                 as traffic_class,
    properties:session_id::string                    as session_id,
    properties:recommendation_session_id::string     as recommendation_session_id,
    properties:algorithm_version::string             as algorithm_version,
    properties:recommendation_item_id::string        as recommendation_item_id,
    properties:media_type::string                    as media_type,
    properties:position::number                      as position,
    properties:batch_sequence::number                as batch_sequence,
    properties:mood_code::string                     as mood_code,
    properties:media_type_code::string               as media_type_code,
    properties:companion_code::string                as companion_code,
    properties:used_typed_input::boolean             as used_typed_input,
    properties:required_restriction_count::number    as required_restriction_count,
    properties:rejection_reason::string              as rejection_reason,
    properties:feedback_reason::string               as feedback_reason,
    properties:error_kind::string                    as error_kind,
    properties:candidate_age_code::string            as candidate_age_code,
    properties:rating_confidence_code::string        as rating_confidence_code,
    properties,
    properties_text,
    event_timestamp_text,
    source_file,
    source_row,
    loaded_at
from parsed
