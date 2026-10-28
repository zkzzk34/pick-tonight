{#
  Shared column descriptions. Columns that appear in several models point
  here with doc('...'), so each meaning is written once.
#}

{% docs col_title_key %}
Durable natural key for a title, in the form media_type:tmdb_id, for example movie:603. TMDB IDs are only unique within a media type, so the media type is part of the key. It stays the same across every version of a title.
{% enddocs %}

{% docs col_title_version_key %}
Surrogate key of one dim_title version: a hash of title_key and the version's valid_from. "-1" is the default row for a title that could not be matched.
{% enddocs %}

{% docs col_date_key %}
Foreign key to dim_date, an integer in YYYYMMDD form. -1 points to the default row.
{% enddocs %}

{% docs col_mood_key %}
Foreign key to dim_mood. "-1" means a mood code that is not in the app's mapping, and "-2" means no mood was given.
{% enddocs %}

{% docs col_event_type_key %}
Foreign key to dim_event_type. "-1" means an event name outside the reviewed taxonomy.
{% enddocs %}

{% docs col_is_default_row %}
True only for the dimension's default row, which facts point to instead of holding a null key.
{% enddocs %}

{% docs col_data_origin %}
Where the event came from: synthetic for the seeded volume-test sessions, or posthog_internal for the operator's own internal traffic. Synthetic rows are never evidence about real users.
{% enddocs %}

{% docs col_distinct_id %}
PostHog's pseudonymous browser ID. Synthetic IDs start with "synthetic-". Pseudonymous, not anonymous.
{% enddocs %}

{% docs col_session_id %}
PickTonight's pseudonymous page-session ID.
{% enddocs %}

{% docs col_recommendation_session_id %}
Pseudonymous ID for one recommendation journey, from context submission to its outcome.
{% enddocs %}

{% docs col_recommendation_item_id %}
Opaque per-card ID created only for analytics. It never contains title identity.
{% enddocs %}

{% docs col_algorithm_version %}
Version label of the recommendation heuristic that produced the journey, for example recommendation-v4.
{% enddocs %}

{% docs col_properties %}
The event's full property object. Every key is checked against the reviewed allowlist, and it holds the same pseudonymous IDs as the ID columns.
{% enddocs %}

{% docs col_extracted_at %}
When the export script pulled the title from TMDB. All rows of one export share it.
{% enddocs %}

{% docs col_loaded_at %}
When 01_load_raw.sql loaded the row into RAW.
{% enddocs %}

{% docs col_source_file %}
Stage path of the file the row was loaded from.
{% enddocs %}

{% docs col_rating_confidence %}
limited, medium, or strong, using the app's rating confidence rules in src/server/recommendation-engine.ts. "unknown" only on the default row.
{% enddocs %}

{% docs col_search_document %}
Title, media type, year, genres, and overview in one string. The text the embedding model reads.
{% enddocs %}
