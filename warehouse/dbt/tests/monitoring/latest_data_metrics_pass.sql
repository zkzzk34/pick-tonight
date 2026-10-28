-- Monitoring: the latest scheduled measurement of every data quality metric
-- passed. A failure here means the daily task found a problem that the dbt
-- tests did not, for example data that changed after the last build.
--
-- It also catches a definition the task has never measured, such as a row
-- just added to the seed, so a new check cannot be silently skipped.
-- Returns one row per failed or unmeasured metric. Zero rows means a pass.

select
    d.metric_id,
    d.table_name,
    d.column_name,
    d.metric_name,
    l.metric_value,
    d.min_expected,
    d.max_expected,
    coalesce(l.status, 'NOT MEASURED') as status,
    l.measured_at
from {{ ref('data_metric_definitions') }} as d
left join {{ source('monitoring', 'dq_metrics_latest') }} as l
    on l.metric_id = d.metric_id
where l.status is distinct from 'PASS'
