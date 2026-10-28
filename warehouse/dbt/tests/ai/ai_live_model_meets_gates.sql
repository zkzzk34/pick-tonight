-- AI quality: the live model meets every gate in ai_quality_gates, judged on
-- the metrics recorded for it.
--
-- Training already refuses to promote a model that fails a gate. This test
-- checks the gatekeeper. It catches a run promoted by hand, and it applies
-- floors raised after the model went live. A gate the live model was never
-- measured on fails too, so a new gate cannot pass by default.
-- Returns one row per problem. Zero rows means a pass.

with live as (

    select run_id
    from {{ source('ai', 'live_model_run') }}

),

live_metrics as (

    select m.metric_name, m.scope, m.metric_value
    from {{ source('ai', 'model_run_metrics') }} as m
    inner join live
        on live.run_id = m.run_id

),

gates as (

    select gate_id, metric_name, scope, min_value
    from {{ ref('ai_quality_gates') }}

)

select
    'none'                          as gate_id,
    null::float                     as live_value,
    null::float                     as min_value,
    'No promoted model run exists.' as problem
where not exists (select 1 from live)

union all

select
    g.gate_id,
    m.metric_value,
    g.min_value,
    iff(m.metric_value is null,
        'The live model was never measured on this metric.',
        'Below the floor.')
from gates as g
left join live_metrics as m
    on m.metric_name = g.metric_name
   and m.scope = g.scope
where exists (select 1 from live)
  -- The same small tolerance the training gate uses for float rounding.
  and (m.metric_value is null or m.metric_value < g.min_value - 1e-9)
