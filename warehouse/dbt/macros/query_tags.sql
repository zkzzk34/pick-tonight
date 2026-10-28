{#
  Query tags per model.

  The profile tags every dbt query "picktonight:dbt". These two macros replace
  dbt-snowflake's defaults so each model's queries carry the model's own name
  instead, for example "picktonight:dbt:stg_tmdb__titles". The cost report in
  warehouse/snowflake/08_cost.sql can then show what each model costs.

  dbt calls set_query_tag before building a model and unset_query_tag after,
  so queries between models keep the profile's tag.
#}

{% macro set_query_tag() -%}
  {%- set new_query_tag = 'picktonight:dbt:' ~ model.name -%}
  {%- set original_query_tag = get_current_query_tag() -%}
  {%- do run_query("alter session set query_tag = '{}'".format(new_query_tag)) -%}
  {{ return(original_query_tag) }}
{%- endmacro %}


{% macro unset_query_tag(original_query_tag) -%}
  {%- if original_query_tag -%}
    {%- do run_query("alter session set query_tag = '{}'".format(original_query_tag)) -%}
  {%- else -%}
    {%- do run_query("alter session unset query_tag") -%}
  {%- endif -%}
{%- endmacro %}
