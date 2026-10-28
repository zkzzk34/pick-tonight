-- Governance: every column that dbt marks with meta.sensitivity must carry
-- the matching DATA_SENSITIVITY tag in Snowflake, because the tag is what
-- triggers masking. The apply_sensitivity_tags post-hook sets the tags; this
-- test proves they are really there after the build.
--
-- The expected list is read from dbt's own project graph, so a new sensitive
-- column is covered as soon as its meta is added.
-- Returns one row per column whose tag is missing or has the wrong value.

-- These refs make dbt run this test after the tables it checks:
-- depends_on: {{ ref('fct_events') }}
-- depends_on: {{ ref('fct_recommendation_journeys') }}

{%- set expected = [] -%}
{%- set relations = [] -%}
{%- if execute -%}
  {%- for node in graph.nodes.values() if node.resource_type == 'model' -%}
    {%- for column_name, column in node.columns.items() -%}
      {%- set sensitivity = (column.meta or {}).get('sensitivity') -%}
      {%- if sensitivity -%}
        {%- do expected.append((node.alias | upper, column_name | upper, sensitivity)) -%}
        {%- if node.relation_name not in relations -%}
          {%- do relations.append(node.relation_name) -%}
        {%- endif -%}
      {%- endif -%}
    {%- endfor -%}
  {%- endfor -%}
{%- endif %}

{% if expected %}

with expected as (

    {% for table_name, column_name, sensitivity in expected %}
    select
        '{{ table_name }}'  as table_name,
        '{{ column_name }}' as column_name,
        '{{ sensitivity }}' as expected_value
    {% if not loop.last %}union all{% endif %}
    {% endfor %}

),

actual as (

    {% for relation_name in relations %}
    select
        object_name as table_name,
        column_name,
        tag_value   as actual_value
    from table({{ target.database }}.information_schema.tag_references_all_columns(
        '{{ relation_name }}', 'table'))
    where tag_name = 'DATA_SENSITIVITY'
    {% if not loop.last %}union all{% endif %}
    {% endfor %}

)

select
    e.table_name,
    e.column_name,
    e.expected_value,
    a.actual_value
from expected as e
left join actual as a
    on a.table_name = e.table_name
   and a.column_name = e.column_name
where a.actual_value is distinct from e.expected_value

{% else %}

-- No sensitive columns are declared, so there is nothing to check.
select null as table_name where false

{% endif %}
