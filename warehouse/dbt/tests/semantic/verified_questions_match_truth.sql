-- Every verified question gives the same answer through the semantic view
-- as an independent query on the marts.
--
-- The questions come from meta.verified_questions on sv_picktonight, read
-- from dbt's project graph, so a new question is tested as soon as it is
-- added. For each one, the two answers must have the same number of rows,
-- and no row may appear in one answer but not the other.
--
-- This matters more than it looks: Snowflake accepts any SQL inside a
-- verified question without checking it. A wrong metric definition, a wrong
-- join, or a broken question would otherwise reach Cortex Analyst silently.
-- Returns one row per question that fails. Zero rows means a pass.

-- These refs make dbt run this test after everything it reads. Only the
-- names listed here can appear in a truth answer.
{%- set semantic = {'sv': ref('sv_picktonight')} -%}
{%- set marts = {
    'fct_recommendation_journeys': ref('fct_recommendation_journeys'),
    'fct_events': ref('fct_events'),
    'fct_title_popularity': ref('fct_title_popularity'),
    'dim_date': ref('dim_date'),
    'dim_event_type': ref('dim_event_type'),
    'dim_mood': ref('dim_mood'),
    'title_catalog_current': ref('title_catalog_current'),
    'bridge_title_genre': ref('bridge_title_genre'),
    'title_rule_moods': ref('title_rule_moods')
} -%}

{%- set questions = [] -%}
{%- if execute -%}
  {%- set node = graph.nodes['model.' ~ project_name ~ '.sv_picktonight'] -%}
  {%- set questions = node.config.meta.get('verified_questions', []) -%}
{%- endif %}

{% if execute and not questions %}

-- An empty list fails too, so the check cannot pass by testing nothing.
select
    'no verified questions found' as question_id,
    0 as semantic_view_rows,
    0 as truth_rows,
    0 as only_in_semantic_view,
    0 as only_in_truth

{% else %}

with results as (

    {% for q in questions %}
    {%- set semantic_sql = fill_question_sql(q.semantic_sql, semantic) %}
    {%- set truth_sql = fill_question_sql(q.truth_sql, marts) %}
    select
        '{{ q.id }}' as question_id,
        (select count(*) from ({{ semantic_sql }})) as semantic_view_rows,
        (select count(*) from ({{ truth_sql }})) as truth_rows,
        (select count(*) from (({{ semantic_sql }}) except ({{ truth_sql }}))) as only_in_semantic_view,
        (select count(*) from (({{ truth_sql }}) except ({{ semantic_sql }}))) as only_in_truth
    {% if not loop.last %}union all{% endif %}
    {% endfor %}

    {%- if not questions %}
    -- Placeholder while dbt parses the project, before the graph is loaded.
    select null::varchar as question_id, 0 as semantic_view_rows, 0 as truth_rows,
           0 as only_in_semantic_view, 0 as only_in_truth
    where false
    {%- endif %}

)

select *
from results
where semantic_view_rows = 0
   or semantic_view_rows <> truth_rows
   or only_in_semantic_view > 0
   or only_in_truth > 0

{% endif %}
