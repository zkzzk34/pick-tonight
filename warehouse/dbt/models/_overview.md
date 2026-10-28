{% docs __overview__ %}
# PickTonight analytics data product

**Owner:** ZK Zhao. **Project:** [zkzzk34/pick-tonight](https://github.com/zkzzk34/pick-tonight), a public portfolio app that helps someone choose what to watch in under two minutes.

This dbt project turns raw catalog and analytics data in Snowflake into a tested, documented star schema. Two kinds of consumers use it: product analytics, and the AI features that train on and search the title catalog.

## What is real and what is not

- **Real:** the TMDB catalog of popular movies and TV series, the app's mood rules, and 100 of the operator's own internal analytics events.
- **Synthetic:** 5,125 seeded events that follow the event taxonomy exactly. They prove the pipeline works at volume. They say nothing about real users, and every row is labeled by `data_origin`.
- **Never here:** real participant events. They stay in PostHog.

## Output ports

| Model | Grain | Main consumers |
|---|---|---|
| `dim_title` | one row per title version, type 2 history | analysts |
| `title_catalog_current` | one row per title in the latest export | Snowpark models, vector search |
| `fct_title_popularity` | one row per title per export | analysts |
| `fct_events` | one row per analytics event | analysts |
| `fct_recommendation_journeys` | one row per recommendation journey | analysts |
| `dim_date`, `dim_event_type`, `dim_mood` | one row per day, event type, and mood, plus default rows | joins from the facts |
| `bridge_title_genre`, `title_rule_moods` | one row per title and genre, and per title and rule mood | Snowpark models |
| `agg_picker_funnel_daily`, `agg_mood_outcomes` | one row per date and origin, and per origin and mood | dashboards |
| `sv_picktonight` | a semantic view: 9 logical tables, 31 dimensions, 20 metrics, 20 verified questions | AI tools such as Cortex Analyst, and analysts |

The lineage graph shows the three consumers outside dbt as exposures.

## Promises

- **Schema:** every public model has an enforced contract. A rename, a dropped column, or a type change fails the build instead of reaching a consumer. A breaking change ships as a new model version with a deprecation date.
- **Quality:** every build runs data tests on keys, required fields, value ranges, referential integrity, and privacy. Error-level failures stop the build. A unit test checks the rating confidence rules against the app's own logic.
- **Freshness:** sources warn when the latest load is more than 7 days old and fail after 30.
- **Answers:** the semantic view's 20 verified questions run on every build, once through the view and once as an independent query on the marts. Any difference fails the build. Snowflake does not check the SQL inside a verified question, so this test is what proves the answers Cortex Analyst will trust.
- **Monitoring:** a daily Snowflake task measures row counts, null counts, duplicate counts, and freshness on the key marts, from a reviewed list in the `data_metric_definitions` seed. dbt warns if the task stops running or if its latest run found a failure.
- **History:** `dim_title` keeps every version of the tracked title attributes. `fct_title_popularity` keeps every export, and full refresh is turned off for it so a rebuild cannot erase that history.
- **Privacy:** events never carry title identity. Any event property outside the reviewed allowlist fails the build. Pseudonymous ID columns are marked with `meta.sensitivity`, dbt sets the matching Snowflake tag after every build, and a test fails if any tag is missing.

## Access

| Role | Can read | Identifiers |
|---|---|---|
| `PICKTONIGHT_ENGINEER` | every layer | real |
| `PICKTONIGHT_ANALYST` | the public marts except the two event facts, the secure views `analyst_events` and `analyst_journeys`, and the semantic view `sv_picktonight` | hashed |

Masking is tag-based. Two masking policies sit on the `DATA_SENSITIVITY` tag, so any column carrying the tag is protected, including columns added later. The hash is deterministic: the same ID always gives the same hash, so analysts can still count distinct sessions and join events to journeys. The secure views leave out the raw event JSON and the file lineage columns. The semantic view needs no access to the tables under it, so it exposes counts and rates only: no dimension is an identifier.

## Keys and default rows

Dimensions use hashed surrogate keys, so a rebuild always produces the same keys. Every dimension has a default row, and every fact key falls back to it instead of null, so a join never silently drops a row. `dim_mood` has two: `-1` for an unknown mood code and `-2` when no mood was given.

## Known limits

- Snowflake trial: Cortex AI functions and data metric functions are not available. The models use Snowpark Python instead of Cortex. A scheduled task measures the same metrics the system data metric functions would, and `09_data_metric_functions_paid.sql` holds the real version for a paid account.
- Snowflake trial: Cortex Analyst is not available either. The semantic view and its verified questions are built and tested anyway. `10_cortex_analyst_evaluation_paid.sql` runs Snowflake's own accuracy evaluation on a paid account.
- The catalog is a popularity window, so a title that drops out of an export still exists on TMDB. Its history stays open.
{% enddocs %}
