{#
  Governance helpers. Masking itself lives in Snowflake: the DATA_SENSITIVITY
  tag carries tag-based masking policies (warehouse/snowflake/07_governance.sql).
  These macros keep dbt and that tag in step.
#}

{% macro apply_sensitivity_tags() %}
  {#-
    Post-hook for every mart. dbt rebuilds tables with CREATE OR REPLACE, which
    drops column tags, so this sets them again in the same run. It reads
    meta.sensitivity on each documented column and returns one ALTER TABLE
    that tags them all. Models without sensitive columns return nothing, and
    dbt skips an empty hook.
  -#}
  {#- Must match the allowed values on the DATA_SENSITIVITY tag. -#}
  {%- set allowed = ['pseudonymous_id', 'contains_pseudonymous_ids', 'public_catalog'] -%}
  {%- set assignments = [] -%}
  {%- for column_name, column in model.columns.items() -%}
    {%- set sensitivity = (column.meta or {}).get('sensitivity') -%}
    {%- if sensitivity -%}
      {%- if sensitivity not in allowed -%}
        {{ exceptions.raise_compiler_error(
            "Column " ~ column_name ~ " in " ~ model.name ~ " has meta.sensitivity '"
            ~ sensitivity ~ "'. Use one of: " ~ allowed | join(', ')
        ) }}
      {%- endif -%}
      {%- do assignments.append(
            'column ' ~ column_name ~ ' set tag '
            ~ target.database ~ ".governance.data_sensitivity = '" ~ sensitivity ~ "'"
      ) -%}
    {%- endif -%}
  {%- endfor -%}
  {%- if assignments -%}
    alter table {{ this }} modify {{ assignments | join(', ') }}
  {%- endif -%}
{% endmacro %}


{% macro grant_schema_usage(custom_schema_name, role_name) %}
  {#-
    on-run-end helper. dbt's grants config covers tables and views but not the
    schema around them, so this grants USAGE on one dbt schema. It skips a
    schema that does not exist yet, for example after a run that built only
    seeds, and returns nothing, so dbt skips the hook statement.
  -#}
  {%- if execute -%}
    {%- set schema_name = generate_schema_name(custom_schema_name, none) | trim -%}
    {%- if adapter.check_schema_exists(target.database, schema_name) -%}
      {%- do run_query('grant usage on schema ' ~ target.database ~ '.' ~ schema_name ~ ' to role ' ~ role_name) -%}
      {{- log('Granted usage on schema ' ~ schema_name ~ ' to ' ~ role_name, info=true) -}}
    {%- endif -%}
  {%- endif -%}
{% endmacro %}
