{#
  PickTonight semantic view.

  One Snowflake object that holds the business meaning of the star schema:
  logical tables, the joins between them, dimensions, and metrics, each with
  a comment and synonyms. Cortex Analyst and other AI tools read it to turn a
  question in plain language into SQL, and people can query it directly:

    select * from semantic_view(<this view>
      dimensions moods.mood_code
      metrics journeys.pick_rate)

  Design rules:
  - Counts and rates only. No dimension exposes an identifier: sessions and
    journeys are counted, never listed. The analyst role can query this view
    without SELECT on the event facts, so this rule is what keeps the IDs
    private.
  - Every declared key and relationship has a matching dbt test on the
    marts, because Snowflake trusts the declarations without checking them.
  - A dimension never shares a name with a column that a metric reads, so
    every metric reads the physical column it names.
  - title_popularity has no test against titles on purpose: popularity keeps
    every export, while titles holds only the latest one.

  Built by the semantic_view materialization from Snowflake Labs'
  dbt_semantic_view package, which passes this body to CREATE SEMANTIC VIEW.
  The verified questions come from meta.verified_questions in
  _semantic__models.yml.
#}

{{ config(materialized='semantic_view') }}

{%- set meta = config.get('meta', {}) or {} %}
{#- Fail the build rather than ship a view with no verified questions. dbt
    reads the YAML meta only at run time, so the check waits for execute. -#}
{%- if execute and not meta.get('verified_questions') %}
  {{ exceptions.raise_compiler_error('sv_picktonight needs meta.verified_questions in _semantic__models.yml.') }}
{%- endif %}

TABLES (
  journeys AS {{ ref('fct_recommendation_journeys') }}
    PRIMARY KEY (journey_key)
    WITH SYNONYMS = ('recommendation journeys', 'picker runs')
    COMMENT = 'One row per recommendation journey, from submitting a context to picking a title, an empty result, an error, or leaving.',
  events AS {{ ref('fct_events') }}
    PRIMARY KEY (event_uuid)
    WITH SYNONYMS = ('analytics events', 'app events')
    COMMENT = 'One row per analytics event sent by the app.',
  dates AS {{ ref('dim_date') }}
    PRIMARY KEY (date_key)
    WITH SYNONYMS = ('calendar')
    COMMENT = 'One row per calendar day, plus a default row for unknown dates.',
  event_types AS {{ ref('dim_event_type') }}
    PRIMARY KEY (event_type_key)
    COMMENT = 'One row per event type in the analytics taxonomy.',
  moods AS {{ ref('dim_mood') }}
    PRIMARY KEY (mood_key)
    UNIQUE (mood_code)
    COMMENT = 'One row per mood a user can pick, plus not_specified and unknown.',
  titles AS {{ ref('title_catalog_current') }}
    PRIMARY KEY (title_key)
    WITH SYNONYMS = ('catalog', 'movies and shows')
    COMMENT = 'One row per movie or TV series in the latest TMDB catalog export.',
  title_genres AS {{ ref('bridge_title_genre') }}
    PRIMARY KEY (title_key, genre_id)
    COMMENT = 'One row per title and genre.',
  title_moods AS {{ ref('title_rule_moods') }}
    PRIMARY KEY (title_key, mood)
    COMMENT = 'One row per title and mood that the app''s genre rules give it.',
  title_popularity AS {{ ref('fct_title_popularity') }}
    PRIMARY KEY (title_popularity_key)
    COMMENT = 'One row per title per catalog export, with that export''s popularity numbers.'
)
RELATIONSHIPS (
  journeys_to_dates AS journeys (submitted_date_key) REFERENCES dates,
  journeys_to_moods AS journeys (mood_key) REFERENCES moods,
  events_to_dates AS events (date_key) REFERENCES dates,
  events_to_event_types AS events (event_type_key) REFERENCES event_types,
  events_to_moods AS events (mood_key) REFERENCES moods,
  title_genres_to_titles AS title_genres (title_key) REFERENCES titles,
  title_moods_to_titles AS title_moods (title_key) REFERENCES titles,
  title_moods_to_moods AS title_moods (mood) REFERENCES moods (mood_code),
  title_popularity_to_titles AS title_popularity (title_key) REFERENCES titles,
  title_popularity_to_dates AS title_popularity (export_date_key) REFERENCES dates
)
DIMENSIONS (
  dates.date_day AS dates.date_day
    WITH SYNONYMS = ('date', 'day')
    COMMENT = 'Calendar date.',
  dates.week_start_date AS dates.week_start_date
    WITH SYNONYMS = ('week')
    COMMENT = 'The Monday that starts the week.',
  dates.month_name AS dates.month_name
    COMMENT = 'Three-letter month name, such as Oct.',
  dates.day_name AS dates.day_name
    COMMENT = 'Three-letter day name, such as Sat.',
  dates.is_weekend AS dates.is_weekend
    WITH SYNONYMS = ('weekend')
    COMMENT = 'True on Saturday and Sunday.',
  event_types.event_name AS event_types.event_name
    COMMENT = 'Event name from the analytics taxonomy, such as context_submitted or watch_intent_confirmed.',
  event_types.event_group AS event_types.event_group
    COMMENT = 'Event group: session, picker, recommendation, engagement, decision, feedback, or error.',
  event_types.funnel_step_order AS event_types.funnel_step_order
    WITH SYNONYMS = ('funnel step')
    COMMENT = 'Step 1 to 5 of the picker funnel. Empty for events outside the funnel.',
  event_types.is_funnel_step AS event_types.is_funnel_step
    COMMENT = 'True for the five picker funnel events.',
  moods.mood_code AS moods.mood_code
    WITH SYNONYMS = ('mood', 'requested mood')
    COMMENT = 'Mood code, such as relaxed or spooked. not_specified when no mood was given, unknown for a code outside the mapping.',
  moods.mood_intent AS moods.mood_intent
    COMMENT = 'What the mood asks for, in plain words.',
  journeys.data_origin AS journeys.data_origin
    WITH SYNONYMS = ('source', 'origin')
    COMMENT = 'synthetic for generated test traffic, posthog_internal for the operator''s own testing. Neither is real user behavior.',
  journeys.requested_media_type AS journeys.media_type_code
    WITH SYNONYMS = ('movie or tv')
    COMMENT = 'What the user asked for: movie, tv, or either.',
  journeys.companion AS journeys.companion_code
    WITH SYNONYMS = ('watching with', 'company')
    COMMENT = 'Who the user is watching with: alone, partner, friends, or family.',
  journeys.used_typed_input AS journeys.used_typed_input
    WITH SYNONYMS = ('typed request')
    COMMENT = 'True when the user typed a request in addition to the guided tags.',
  journeys.ended_with_pick AS journeys.chose_title
    WITH SYNONYMS = ('picked', 'converted')
    COMMENT = 'True when the journey ended with the user confirming a title to watch.',
  journeys.ended_with_no_results AS journeys.ended_empty
    COMMENT = 'True when the journey showed the empty result state.',
  journeys.ended_with_api_error AS journeys.ended_with_error
    COMMENT = 'True when the journey showed an API error.',
  journeys.algorithm_version AS journeys.algorithm_version
    COMMENT = 'Version label of the recommendation algorithm.',
  events.data_origin AS events.data_origin
    WITH SYNONYMS = ('source', 'origin')
    COMMENT = 'synthetic for generated test traffic, posthog_internal for the operator''s own testing. Neither is real user behavior.',
  events.rejection_reason AS events.rejection_reason
    COMMENT = 'Why a recommendation was rejected. Set on recommendation_rejected events.',
  events.feedback_reason AS events.feedback_reason
    COMMENT = 'Reason the user gave in feedback, such as wrong-mood. Set on feedback_submitted events.',
  events.error_kind AS events.error_kind
    COMMENT = 'Kind of API error. Set on api_error_shown events.',
  events.shown_rating_confidence AS events.rating_confidence_code
    COMMENT = 'Rating confidence of a shown recommendation: limited, medium, or strong.',
  events.shown_candidate_age AS events.candidate_age_code
    COMMENT = 'Age of a shown recommendation: recent, established, or unknown.',
  titles.title AS titles.title
    WITH SYNONYMS = ('name', 'movie', 'show')
    COMMENT = 'Display title.',
  titles.media_type AS titles.media_type
    COMMENT = 'movie or tv.',
  titles.release_year AS titles.release_year
    WITH SYNONYMS = ('year')
    COMMENT = 'Release year. First air year for TV.',
  titles.original_language AS titles.original_language
    WITH SYNONYMS = ('language')
    COMMENT = 'ISO 639-1 code of the original language, such as en or ko.',
  titles.rating_confidence AS titles.rating_confidence
    COMMENT = 'How much to trust the TMDB rating, based on vote count: limited, medium, or strong.',
  title_genres.genre_name AS title_genres.genre_name
    WITH SYNONYMS = ('genre')
    COMMENT = 'TMDB genre name, such as Comedy or Drama.'
)
METRICS (
  journeys.journey_count AS COUNT(journeys.journey_key)
    WITH SYNONYMS = ('journeys', 'recommendation runs')
    COMMENT = 'Number of recommendation journeys.',
  journeys.picked_journey_count AS COUNT_IF(journeys.chose_title)
    WITH SYNONYMS = ('picks', 'choices')
    COMMENT = 'Journeys that ended with a confirmed title.',
  journeys.pick_rate AS AVG(IFF(journeys.chose_title, 1, 0))
    WITH SYNONYMS = ('choose rate', 'conversion rate')
    COMMENT = 'Share of journeys that ended with a confirmed title, from 0 to 1.',
  journeys.avg_seconds_to_decision AS AVG(journeys.seconds_to_decision)
    WITH SYNONYMS = ('time to decide')
    COMMENT = 'Average seconds from submitting a context to confirming a title. Journeys without a pick are left out.',
  journeys.median_seconds_to_decision AS MEDIAN(journeys.seconds_to_decision)
    COMMENT = 'Median seconds from submitting a context to confirming a title. Journeys without a pick are left out.',
  journeys.avg_rejections AS AVG(journeys.items_rejected)
    COMMENT = 'Average recommendations rejected per journey.',
  journeys.empty_rate AS AVG(IFF(journeys.ended_empty, 1, 0))
    COMMENT = 'Share of journeys that showed the empty result state, from 0 to 1.',
  journeys.error_rate AS AVG(IFF(journeys.ended_with_error, 1, 0))
    COMMENT = 'Share of journeys that showed an API error, from 0 to 1.',
  journeys.items_shown_total AS SUM(journeys.items_shown)
    COMMENT = 'Recommendations shown, summed over journeys.',
  journeys.items_saved_total AS SUM(journeys.items_saved)
    COMMENT = 'Recommendations saved to the watchlist, summed over journeys.',
  events.event_count AS COUNT(events.event_uuid)
    COMMENT = 'Number of analytics events.',
  events.session_count AS COUNT(DISTINCT events.session_id)
    WITH SYNONYMS = ('sessions', 'visits')
    COMMENT = 'Distinct page sessions. Session IDs are counted, never shown.',
  titles.title_count AS COUNT(titles.title_key)
    WITH SYNONYMS = ('number of titles')
    COMMENT = 'Number of titles in the current catalog.',
  titles.avg_vote_average AS AVG(titles.vote_average)
    WITH SYNONYMS = ('average rating')
    COMMENT = 'Average TMDB user rating, on a 0 to 10 scale.',
  titles.avg_popularity AS AVG(titles.popularity)
    COMMENT = 'Average TMDB popularity score in the latest export.',
  title_genres.titles_in_genre AS COUNT(DISTINCT title_genres.title_key)
    COMMENT = 'Number of distinct titles that have the genre.',
  title_moods.titles_for_mood AS COUNT(DISTINCT title_moods.title_key)
    WITH SYNONYMS = ('catalog supply')
    COMMENT = 'Number of distinct catalog titles the genre rules give the mood.',
  title_popularity.title_snapshot_count AS COUNT(title_popularity.title_popularity_key)
    COMMENT = 'Title snapshots stored, one per title per catalog export.',
  title_popularity.avg_popularity_score AS AVG(title_popularity.popularity)
    COMMENT = 'Average TMDB popularity score across the stored snapshots.',
  title_popularity.export_count AS COUNT(DISTINCT title_popularity.extracted_at)
    COMMENT = 'Number of distinct catalog exports stored.'
)
COMMENT = 'PickTonight product analytics and title catalog, for questions in plain language. Counts and rates only: no identifiers.'
AI_SQL_GENERATION 'Every journey and event has a data_origin. synthetic is generated test traffic and posthog_internal is the operator''s own testing; neither is real user behavior. Always group by or filter on data_origin for journey and event questions, and say which origin a number comes from. Rates are shares from 0 to 1: round them to 4 decimals. Round averages to 2 decimals.'
AI_QUESTION_CATEGORIZATION 'Questions about a specific person, user, device, or session ID are out of scope: this view holds counts only and never shows identifiers. Questions about where a title can be streamed are out of scope: provider availability is not stored in the warehouse.'

{{ verified_queries_clause(meta.get('verified_questions', []), this, meta.get('verified_by', 'zk_zhao')) }}
