{#
  Helpers for the semantic view and its verified questions.

  The 20 verified questions live in one place: meta.verified_questions in
  models/semantic/_semantic__models.yml. Each question has two answers:

    semantic_sql  the answer through the semantic view, the way an AI or an
                  analyst would ask it
    truth_sql     an independent answer written straight on the marts

  The SQL uses placeholders instead of database and schema names, so the
  same text works in any environment:

    {sv}           the semantic view, allowed only in semantic_sql
    {<mart name>}  a mart, such as {fct_events}, allowed only in truth_sql

  Keeping the two sets apart is what makes the check honest: the truth
  answer can never read the semantic view it is checking.
#}


{% macro fill_question_sql(sql, relations) %}
  {#-
    Replaces each {name} placeholder with its relation. A placeholder with no
    relation fails the compile, so a typo, or a truth answer that tries to
    read the semantic view, never reaches Snowflake.
  -#}
  {%- set filled = namespace(sql=sql) -%}
  {%- for name, relation in relations.items() -%}
    {%- set filled.sql = filled.sql | replace('{' ~ name ~ '}', relation | string) -%}
  {%- endfor -%}
  {%- set leftover = modules.re.findall('[{][a-z0-9_]+[}]', filled.sql) -%}
  {%- if leftover -%}
    {{ exceptions.raise_compiler_error(
        'Placeholder ' ~ (leftover | join(', ')) ~ ' is not allowed here. '
        ~ 'Allowed: ' ~ (relations.keys() | list | join(', ')) ~ '.'
    ) }}
  {%- endif -%}
  {{ return(filled.sql) }}
{% endmacro %}


{% macro verified_queries_clause(questions, semantic_view, verified_by) %}
  {#-
    Renders the AI_VERIFIED_QUERIES clause from the reviewed question list.
    Cortex Analyst uses these as trusted examples. Snowflake accepts any SQL
    here without checking it, so the test verified_questions_match_truth is
    what proves every answer on every build.
  -#}
  {%- if not questions -%}
    {{ return('') }}
  {%- endif -%}
AI_VERIFIED_QUERIES (
{%- for q in questions %}
  {{ q.id }} AS (
    QUESTION '{{ q.question | replace("'", "''") }}'
    VERIFIED_AT {{ (modules.datetime.date.fromisoformat(q.verified_on | string) - modules.datetime.date(1970, 1, 1)).days * 86400 }}
    {%- if q.onboarding %}
    ONBOARDING_QUESTION TRUE
    {%- endif %}
    VERIFIED_BY '(OWNER = {{ verified_by }})'
    SQL '{{ fill_question_sql(q.semantic_sql, {'sv': semantic_view}) | replace("'", "''") }}'
  ){{ ',' if not loop.last }}
{%- endfor %}
)
{%- endmacro %}
