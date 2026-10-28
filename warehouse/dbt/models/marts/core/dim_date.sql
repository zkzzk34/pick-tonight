-- Calendar dimension.
-- Grain: one row per day from 2026-01-01 through 2027-12-31, plus one default row.
--
-- date_key is an integer in YYYYMMDD form, for example 20261026. That is the
-- usual convention for date dimensions: readable and sortable.

with days as (

    {{ dbt_utils.date_spine(
        datepart="day",
        start_date="cast('2026-01-01' as date)",
        end_date="cast('2028-01-01' as date)"
    ) }}

)

select
    to_number(to_char(date_day, 'YYYYMMDD'))  as date_key,
    date_day::date                            as date_day,
    year(date_day)                            as year_number,
    quarter(date_day)                         as quarter_number,
    month(date_day)                           as month_number,
    monthname(date_day)                       as month_name,
    date_trunc('week', date_day)::date        as week_start_date,
    dayofweekiso(date_day)                    as day_of_week_iso,
    dayname(date_day)                         as day_name,
    dayofweekiso(date_day) in (6, 7)          as is_weekend,
    false                                     as is_default_row
from days

union all

select
    -1, null, null, null, null, null, null, null, null, null, true
