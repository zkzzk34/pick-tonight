-- Privacy: every property key on every stored event must be in the reviewed
-- analytics_property_allowlist seed. This is the warehouse's copy of the
-- app's browser allowlist. It catches anything that slipped past the app,
-- such as a title or a TMDB ID, and anything an SDK adds on its own.
--
-- Returns one row per unexpected property name, with how many events carry
-- it, so a failure shows exactly what leaked. Zero rows means a pass.
--
-- An anti-join is used instead of NOT IN: if the allowlist ever held a null,
-- NOT IN would quietly pass every event.

with event_property_names as (

    select
        e.event_uuid,
        k.value::string as property_name
    from {{ ref('stg_analytics__events') }} as e,
        lateral flatten(input => object_keys(e.properties)) as k
    where e.properties is not null

)

select
    p.property_name,
    count(distinct p.event_uuid) as events
from event_property_names as p
left join {{ ref('analytics_property_allowlist') }} as a
    on a.property_name = p.property_name
where a.property_name is null
group by p.property_name
