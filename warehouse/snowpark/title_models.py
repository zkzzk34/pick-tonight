"""Snowpark ML models for the PickTonight catalog.

This module runs inside Snowflake. You upload it to the RAW stage, and
05_snowpark_ml.sql creates two Snowflake objects that import it:

* ``AI.TRAIN_TITLE_MODELS()`` is a Python stored procedure. It reads
  ``DBT_MARTS.TITLE_CATALOG_CURRENT`` and ``DBT_MARTS.TITLE_RULE_MOODS``, the
  dbt marts built for AI consumers, trains two models with scikit-learn on
  the warehouse, and writes the results back as tables.
* ``AI.EMBED_TEXT(text)`` is a Python UDF. It loads the saved embedding
  pipeline and turns any text, such as a search query, into the same vector
  space as the titles, so SQL can rank titles with VECTOR_COSINE_SIMILARITY.

Model 1, title embeddings (latent semantic analysis):
    TF-IDF over each title's search document, reduced with truncated SVD and
    L2-normalized. Titles that share themes end up close together even when
    they use different words. These are classic LSA embeddings, not neural
    embeddings: Snowflake trial accounts block Cortex AI functions.

Model 2, a weakly supervised mood classifier:
    The app maps moods to TMDB genres (src/server/mood-mapping.ts). Those
    genre rules become training labels, and a one-vs-rest logistic regression
    learns to predict them from the title and overview text only. Genres are
    left out of the features on purpose, so the model cannot just copy the
    rule. Every title is scored by a model trained on the other folds of a
    5-fold split, so precision and recall show how much mood signal the text
    carries, and confident disagreements point at titles where a genre is a
    poor proxy for mood.

Quality gates (train, check, then promote):
    Every run is a candidate. It is scored against the reviewed gates in
    ``DBT_SEEDS.AI_QUALITY_GATES``: a floor for each metric, and a limit on
    how far it may drop below the live model. Search quality is part of the
    check: the test queries in ``DBT_SEEDS.SEARCH_EVAL_QUERIES`` are scored
    with the candidate embeddings before anything goes live. A run that
    passes every gate is promoted. A run that fails is recorded with its
    reasons, and the live model stays as it was.

Training data record:
    Each run saves what it learned from: fingerprints of the training titles
    and rule labels (the same HASH_AGG method as the dbt parity tests), the
    catalog export time, row counts, settings, a checksum of this file, and
    the library versions. dbt compares those fingerprints with the current
    marts and warns when the live model is out of date.

The pure functions below have no Snowflake dependency, so
``test_title_models.py`` can test them locally. It also runs the whole
procedure against a small fake session.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import tempfile
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import numpy as np
import sklearn
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_recall_fscore_support
from sklearn.model_selection import KFold
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import Normalizer

MODEL_VERSION = "title-models-v1"

# Moods the app maps to genres. "surprised" is a discovery signal with no
# genre rule, so it has no labels to learn from.
MOODS: tuple[str, ...] = (
    "relaxed",
    "laughing",
    "excited",
    "thoughtful",
    "romantic",
    "spooked",
)

EMBEDDING_DIMENSIONS = 128
EMBEDDER_FILE_NAME = "title_embedder.joblib"

# Same cutoff as the overview_present data quality check.
MINIMUM_OVERVIEW_LENGTH = 20

# A prediction this confident that disagrees with the genre rules is worth a
# human look. Regularized logistic regression keeps out-of-fold probabilities
# away from 0 and 1: the first full run stayed between about 0.15 and 0.86,
# and cutoffs of 0.8 and 0.2 flagged only 1 title. 0.7 and 0.3 mark the
# confident tail of that range instead.
DISAGREEMENT_HIGH = 0.7
DISAGREEMENT_LOW = 0.3

RANDOM_SEED = 42
CROSS_VALIDATION_FOLDS = 5

# Search quality is genre precision in the top 10 results of each test query.
SEARCH_TOP_K = 10

# Embeddings are stored rounded to 6 decimals, as 32-bit VECTOR values. The
# search check scores the candidate at that same precision, so it measures
# what the live search will really return.
EMBEDDING_STORAGE_DECIMALS = 6

# A metric may equal its floor, or sit exactly max_drop below the live model.
# This small tolerance absorbs float rounding at those edges.
GATE_TOLERANCE = 1e-9

DATABASE = "PICKTONIGHT"

# Inputs and outputs, all inside the PICKTONIGHT database.
CATALOG_TABLE = "DBT_MARTS.TITLE_CATALOG_CURRENT"
RULE_MOODS_TABLE = "DBT_MARTS.TITLE_RULE_MOODS"
GATES_TABLE = "DBT_SEEDS.AI_QUALITY_GATES"
SEARCH_QUERIES_TABLE = "DBT_SEEDS.SEARCH_EVAL_QUERIES"
RUNS_TABLE = "AI.MODEL_RUNS"
LIVE_RUN_VIEW = "AI.LIVE_MODEL_RUN"
RUN_METRICS_TABLE = "AI.MODEL_RUN_METRICS"
GATE_RESULTS_TABLE = "AI.MODEL_GATE_RESULTS"
EMBEDDINGS_HISTORY_TABLE = "AI.TITLE_EMBEDDINGS_HISTORY"
PREDICTIONS_HISTORY_TABLE = "AI.TITLE_MOODS_PREDICTED_HISTORY"
MODEL_STAGE = "AI.MODEL_STAGE"

# Fingerprints of the training inputs. The dbt test ai_live_model_is_current
# computes the same expressions on the marts, so the column lists here and
# there must stay identical.
CATALOG_FINGERPRINT_COLUMNS = "TITLE_KEY, MEDIA_TYPE, TITLE, OVERVIEW, SEARCH_DOCUMENT, GENRE_NAMES"
RULE_MOODS_FINGERPRINT_COLUMNS = "TITLE_KEY, MOOD"


# --------------------------------------------------------------------------
# Embeddings
# --------------------------------------------------------------------------


def build_embedder(n_components: int = EMBEDDING_DIMENSIONS) -> Pipeline:
    """TF-IDF, then truncated SVD, then unit length, so dot product = cosine."""
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    stop_words="english",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.6,
                    sublinear_tf=True,
                ),
            ),
            ("svd", TruncatedSVD(n_components=n_components, random_state=RANDOM_SEED)),
            ("normalize", Normalizer(copy=False)),
        ]
    )


@dataclass(frozen=True)
class EmbeddingResult:
    pipeline: Pipeline
    vectors: np.ndarray
    dimensions: int
    vocabulary_size: int
    explained_variance: float


def fit_embeddings(
    documents: Sequence[str], n_components: int = EMBEDDING_DIMENSIONS
) -> EmbeddingResult:
    """Fit the embedder on the catalog and return one unit vector per document."""
    if len(documents) < 3:
        raise ValueError("At least three documents are needed to fit embeddings.")

    # SVD needs fewer components than both documents and vocabulary terms.
    # Probe the vocabulary first so a small catalog still fits.
    probe = build_embedder(n_components).named_steps["tfidf"]
    vocabulary_size = len(probe.fit(documents).vocabulary_)
    dimensions = max(1, min(n_components, vocabulary_size - 1, len(documents) - 1))

    pipeline = build_embedder(dimensions)
    vectors = pipeline.fit_transform(documents)
    explained = float(pipeline.named_steps["svd"].explained_variance_ratio_.sum())

    return EmbeddingResult(
        pipeline=pipeline,
        vectors=np.asarray(vectors, dtype=np.float64),
        dimensions=dimensions,
        vocabulary_size=vocabulary_size,
        explained_variance=explained,
    )


# --------------------------------------------------------------------------
# Mood classifier
# --------------------------------------------------------------------------


def _text_or_empty(value: Any) -> str:
    # Snowflake NULLs arrive as None; float NaN is handled too, just in case.
    return value.strip() if isinstance(value, str) else ""


def classifier_text(title: str, overview: Any) -> str:
    """Title and overview only. Genres are excluded so labels cannot leak."""
    return f"{title}. {_text_or_empty(overview)}".strip()


def has_usable_overview(overview: Any) -> bool:
    return len(_text_or_empty(overview)) >= MINIMUM_OVERVIEW_LENGTH


def build_label_matrix(
    title_keys: Sequence[str],
    rule_moods: Sequence[tuple[str, str]],
    moods: Sequence[str] = MOODS,
) -> np.ndarray:
    """One row per title, one 0/1 column per mood, from (title_key, mood) pairs."""
    row_of = {key: index for index, key in enumerate(title_keys)}
    column_of = {mood: index for index, mood in enumerate(moods)}
    labels = np.zeros((len(title_keys), len(moods)), dtype=int)

    for title_key, mood in rule_moods:
        row = row_of.get(title_key)
        column = column_of.get(mood)
        if row is not None and column is not None:
            labels[row, column] = 1

    return labels


def build_mood_classifier() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    stop_words="english",
                    ngram_range=(1, 2),
                    min_df=2,
                    sublinear_tf=True,
                ),
            ),
            (
                "classifier",
                OneVsRestClassifier(
                    # Balanced weights stop rare moods from being ignored.
                    LogisticRegression(max_iter=2000, class_weight="balanced")
                ),
            ),
        ]
    )


@dataclass(frozen=True)
class MoodTrainingResult:
    model: Pipeline
    metrics: list[dict[str, Any]]
    micro_f1: float
    folds: int
    # Each title's probabilities come from a model that never saw that title,
    # so disagreements with the rules are honest rather than memorized.
    out_of_fold_probabilities: np.ndarray


def train_mood_classifier(
    texts: Sequence[str],
    labels: np.ndarray,
    moods: Sequence[str] = MOODS,
    folds: int = CROSS_VALIDATION_FOLDS,
) -> MoodTrainingResult:
    """Score every title with k-fold cross-validation, then refit on everything."""
    # Moods with no positive (or no negative) example cannot be learned.
    positives = labels.sum(axis=0)
    if np.any(positives == 0) or np.any(positives == len(texts)):
        empty = [mood for mood, count in zip(moods, positives) if count in (0, len(texts))]
        raise ValueError(f"These moods need both positive and negative examples: {empty}")

    texts = list(texts)
    out_of_fold = np.zeros(labels.shape, dtype=float)
    splitter = KFold(n_splits=folds, shuffle=True, random_state=RANDOM_SEED)

    for train_index, test_index in splitter.split(texts):
        fold_model = build_mood_classifier()
        fold_model.fit([texts[i] for i in train_index], labels[train_index])
        out_of_fold[test_index] = fold_model.predict_proba([texts[i] for i in test_index])

    predicted = (out_of_fold >= 0.5).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(
        labels, predicted, average=None, zero_division=0
    )
    metrics = [
        {
            "mood": mood,
            "precision": round(float(precision[index]), 4),
            "recall": round(float(recall[index]), 4),
            "f1": round(float(f1[index]), 4),
            "rule_positives": int(support[index]),
            "rule_positive_rate": round(float(labels[:, index].mean()), 4),
        }
        for index, mood in enumerate(moods)
    ]
    micro = float(f1_score(labels, predicted, average="micro", zero_division=0))

    final_model = build_mood_classifier()
    final_model.fit(texts, labels)

    return MoodTrainingResult(
        model=final_model,
        metrics=metrics,
        micro_f1=round(micro, 4),
        folds=folds,
        out_of_fold_probabilities=out_of_fold,
    )


def disagreement_kind(probability: float, rule_label: int) -> str | None:
    """Name a confident disagreement between the text model and the rules."""
    if rule_label == 0 and probability >= DISAGREEMENT_HIGH:
        return "text_suggests_mood_rules_miss"
    if rule_label == 1 and probability <= DISAGREEMENT_LOW:
        return "rules_give_mood_text_does_not_support"
    return None


# --------------------------------------------------------------------------
# Search quality
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class SearchQuery:
    query_id: str
    search_text: str
    expected_genre: str
    media_type: str


def as_storage_precision(vectors: np.ndarray) -> np.ndarray:
    """Round and narrow vectors to the precision the warehouse stores."""
    rounded = np.round(np.asarray(vectors, dtype=np.float64), EMBEDDING_STORAGE_DECIMALS)
    return rounded.astype(np.float32)


def genre_list(value: Any) -> list[str]:
    """Genre names as a list. Snowpark returns ARRAY columns as JSON text."""
    if value is None:
        return []
    if isinstance(value, str):
        value = json.loads(value) if value.strip() else []
    return [str(item) for item in value]


def search_precision_at_k(
    query_vectors: np.ndarray,
    title_vectors: np.ndarray,
    title_media_types: Sequence[str],
    title_genres: Sequence[Sequence[str]],
    queries: Sequence[SearchQuery],
    k: int = SEARCH_TOP_K,
) -> list[dict[str, Any]]:
    """Genre precision@k for each test query, scored the way live search ranks.

    Each query is compared with every title of its media type by cosine
    similarity, the measure VECTOR_COSINE_SIMILARITY uses. A hit is a top-k
    title whose genres include the expected genre. Titles are scored at the
    precision they are stored at. The query vector, like the one
    AI.EMBED_TEXT returns, is only narrowed to 32 bits. Titles with an empty
    vector cannot be ranked, so they are skipped.
    """
    titles = as_storage_precision(title_vectors).astype(np.float64)
    title_norms = np.linalg.norm(titles, axis=1)
    media_types = np.asarray(list(title_media_types))
    results = []

    for query, vector in zip(queries, query_vectors):
        q = np.asarray(vector, dtype=np.float32).astype(np.float64)
        q_norm = float(np.linalg.norm(q))
        candidates = np.flatnonzero((media_types == query.media_type) & (title_norms > 0))
        hits = 0
        if len(candidates) and q_norm > 0:
            scores = (titles[candidates] @ q) / (title_norms[candidates] * q_norm)
            # A stable sort keeps ties in catalog order, so reruns agree.
            top = candidates[np.argsort(-scores, kind="stable")[:k]]
            hits = sum(1 for index in top if query.expected_genre in title_genres[index])
        results.append(
            {"query_id": query.query_id, "hits": hits, "precision_at_k": round(hits / k, 4)}
        )

    return results


# --------------------------------------------------------------------------
# Quality gates
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Gate:
    """One reviewed row of DBT_SEEDS.AI_QUALITY_GATES."""

    gate_id: str
    metric_name: str
    scope: str
    min_value: float | None
    max_drop: float | None


@dataclass(frozen=True)
class GateResult:
    gate_id: str
    metric_name: str
    scope: str
    metric_value: float | None
    min_value: float | None
    live_value: float | None
    max_drop: float | None
    passed: bool
    reason: str


def run_metric_values(
    embedding: EmbeddingResult,
    moods: MoodTrainingResult,
    search: Sequence[dict[str, Any]],
    titles_embedded: int,
    mood_titles: int,
    disagreements: int,
) -> dict[tuple[str, str], float]:
    """Every number a run produces, keyed by (metric name, scope).

    Scope is "all" for whole-model numbers, the mood for mood metrics, and
    the query ID for one search query. These names are what the gates and
    AI.MODEL_RUN_METRICS use.
    """
    values: dict[tuple[str, str], float] = {
        ("mood_micro_f1", "all"): float(moods.micro_f1),
        ("embedding_dimensions", "all"): float(embedding.dimensions),
        ("embedding_explained_variance", "all"): round(float(embedding.explained_variance), 4),
        ("embedding_vocabulary_size", "all"): float(embedding.vocabulary_size),
        ("titles_embedded", "all"): float(titles_embedded),
        ("mood_titles", "all"): float(mood_titles),
        ("confident_disagreements", "all"): float(disagreements),
    }
    for row in moods.metrics:
        mood = row["mood"]
        values[("mood_precision", mood)] = float(row["precision"])
        values[("mood_recall", mood)] = float(row["recall"])
        values[("mood_f1", mood)] = float(row["f1"])
        values[("mood_rule_positives", mood)] = float(row["rule_positives"])
        values[("mood_rule_positive_rate", mood)] = float(row["rule_positive_rate"])
    if search:
        precisions = [float(row["precision_at_k"]) for row in search]
        for row in search:
            values[(f"search_precision_at_{SEARCH_TOP_K}", row["query_id"])] = float(
                row["precision_at_k"]
            )
        values[(f"search_mean_precision_at_{SEARCH_TOP_K}", "all")] = round(
            sum(precisions) / len(precisions), 4
        )
        values[(f"search_min_precision_at_{SEARCH_TOP_K}", "all")] = min(precisions)
    return values


def evaluate_gates(
    values: Mapping[tuple[str, str], float],
    gates: Sequence[Gate],
    live_values: Mapping[tuple[str, str], float] | None = None,
) -> list[GateResult]:
    """Check a candidate against every gate.

    A gate fails when the candidate was not measured on its metric, when the
    value is below the floor, or when it is more than max_drop below the
    live model. The live model check is skipped when there is no live value,
    for example on the very first run.
    """
    if not gates:
        raise ValueError("No quality gates were found, so no model can be promoted.")

    live_values = live_values or {}
    results = []
    for gate in gates:
        key = (gate.metric_name, gate.scope)
        value = values.get(key)
        live = live_values.get(key)

        if value is None:
            passed, reason = False, "The candidate was not measured on this metric."
        elif gate.min_value is not None and value < gate.min_value - GATE_TOLERANCE:
            passed, reason = False, f"{value:.4f} is below the floor of {gate.min_value:.4f}."
        elif (
            live is not None
            and gate.max_drop is not None
            and value < live - gate.max_drop - GATE_TOLERANCE
        ):
            passed, reason = (
                False,
                f"{value:.4f} is more than {gate.max_drop:.4f} below the live model's {live:.4f}.",
            )
        else:
            passed, reason = True, "Passed."

        results.append(
            GateResult(
                gate_id=gate.gate_id,
                metric_name=gate.metric_name,
                scope=gate.scope,
                metric_value=value,
                min_value=gate.min_value,
                live_value=live,
                max_drop=gate.max_drop,
                passed=passed,
                reason=reason,
            )
        )
    return results


def storage_contract_result(dimensions: int) -> GateResult:
    """A built-in gate: the warehouse stores VECTOR(FLOAT, 128), so any other
    size could not be written or searched. It is in code, not in the seed,
    because no review should be able to loosen it."""
    passed = dimensions == EMBEDDING_DIMENSIONS
    return GateResult(
        gate_id="embedding_storage_contract",
        metric_name="embedding_dimensions",
        scope="all",
        metric_value=float(dimensions),
        min_value=float(EMBEDDING_DIMENSIONS),
        live_value=None,
        max_drop=None,
        passed=passed,
        reason="Passed."
        if passed
        else f"The warehouse stores {EMBEDDING_DIMENSIONS}-dimension vectors, and this run made {dimensions}.",
    )


def module_checksum() -> str:
    """SHA-256 of this file, so a run can be traced to the exact code.

    It matches "sha256sum warehouse/snowpark/title_models.py" on the commit
    that was uploaded to the stage.
    """
    try:
        with open(__file__, "rb") as handle:
            return hashlib.sha256(handle.read()).hexdigest()
    except OSError:
        return "unknown"


# --------------------------------------------------------------------------
# Snowflake entry points
# --------------------------------------------------------------------------


def _table(name: str) -> str:
    return f"{DATABASE}.{name}"


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    number = float(value)
    return None if math.isnan(number) or math.isinf(number) else number


def _json_literal(value: Any) -> str:
    """JSON text, escaped to sit inside a single-quoted SQL string.

    Snowflake treats a backslash in a string literal as an escape, so
    backslashes are doubled before quotes are.
    """
    text = json.dumps(value, allow_nan=False, default=str)
    return text.replace("\\", "\\\\").replace("'", "''")


def _insert_json_rows(
    session: Any, table: str, columns: Sequence[tuple[str, str]], rows: list[dict[str, Any]]
) -> None:
    """Insert rows by flattening one JSON array.

    Snowflake reads each column with an explicit type, so nothing depends on
    Snowpark guessing types, even for a column that is empty in every row.
    Used for the small tables only: metrics and gate results.
    """
    if not rows:
        return
    names = ", ".join(name for name, _ in columns)
    values = ", ".join(f"f.value:{name.lower()}::{sql_type}" for name, sql_type in columns)
    session.sql(
        f"INSERT INTO {_table(table)} ({names}) "
        f"SELECT {values} "
        f"FROM TABLE(FLATTEN(INPUT => PARSE_JSON('{_json_literal(rows)}'))) AS f"
    ).collect()


METRIC_COLUMNS = (
    ("RUN_ID", "VARCHAR"),
    ("METRIC_NAME", "VARCHAR"),
    ("SCOPE", "VARCHAR"),
    ("METRIC_VALUE", "FLOAT"),
    ("MODEL_VERSION", "VARCHAR"),
)

GATE_RESULT_COLUMNS = (
    ("RUN_ID", "VARCHAR"),
    ("GATE_ID", "VARCHAR"),
    ("METRIC_NAME", "VARCHAR"),
    ("SCOPE", "VARCHAR"),
    ("METRIC_VALUE", "FLOAT"),
    ("MIN_VALUE", "FLOAT"),
    ("LIVE_VALUE", "FLOAT"),
    ("MAX_DROP", "FLOAT"),
    ("PASSED", "BOOLEAN"),
    ("REASON", "VARCHAR"),
)


def read_gates(session: Any) -> list[Gate]:
    rows = (
        session.table(_table(GATES_TABLE))
        .select("GATE_ID", "METRIC_NAME", "SCOPE", "MIN_VALUE", "MAX_DROP")
        .sort("GATE_ID")
        .collect()
    )
    return [
        Gate(
            gate_id=row["GATE_ID"],
            metric_name=row["METRIC_NAME"],
            scope=row["SCOPE"],
            min_value=_float_or_none(row["MIN_VALUE"]),
            max_drop=_float_or_none(row["MAX_DROP"]),
        )
        for row in rows
    ]


def read_search_queries(session: Any) -> list[SearchQuery]:
    rows = (
        session.table(_table(SEARCH_QUERIES_TABLE))
        .select("QUERY_ID", "SEARCH_TEXT", "EXPECTED_GENRE", "MEDIA_TYPE")
        .sort("QUERY_ID")
        .collect()
    )
    return [
        SearchQuery(
            query_id=row["QUERY_ID"],
            search_text=row["SEARCH_TEXT"],
            expected_genre=row["EXPECTED_GENRE"],
            media_type=row["MEDIA_TYPE"],
        )
        for row in rows
    ]


def read_live_metrics(session: Any) -> tuple[str | None, dict[tuple[str, str], float]]:
    """The live model's run ID and its recorded metrics, or (None, {})."""
    rows = session.sql(
        f"SELECT r.RUN_ID, m.METRIC_NAME, m.SCOPE, m.METRIC_VALUE "
        f"FROM {_table(LIVE_RUN_VIEW)} AS r "
        f"LEFT JOIN {_table(RUN_METRICS_TABLE)} AS m ON m.RUN_ID = r.RUN_ID"
    ).collect()
    if not rows:
        return None, {}
    values = {}
    for row in rows:
        value = _float_or_none(row["METRIC_VALUE"])
        if row["METRIC_NAME"] is not None and value is not None:
            values[(row["METRIC_NAME"], row["SCOPE"])] = value
    return rows[0]["RUN_ID"], values


def collect_lineage(session: Any, run_id: str) -> dict[str, Any]:
    """What this run learned from and how, read before training starts."""
    catalog = session.sql(
        f"SELECT COUNT(*) AS ROW_COUNT, "
        f"TO_VARCHAR(HASH_AGG({CATALOG_FINGERPRINT_COLUMNS})) AS FINGERPRINT, "
        f"TO_VARCHAR(MAX(EXTRACTED_AT)) AS EXPORTED_AT "
        f"FROM {_table(CATALOG_TABLE)}"
    ).collect()[0]
    rule_moods = session.sql(
        f"SELECT COUNT(*) AS ROW_COUNT, "
        f"TO_VARCHAR(HASH_AGG({RULE_MOODS_FINGERPRINT_COLUMNS})) AS FINGERPRINT, "
        f"LISTAGG(DISTINCT MOOD_MAPPING_VERSION, ',') "
        f"WITHIN GROUP (ORDER BY MOOD_MAPPING_VERSION) AS MAPPING_VERSIONS "
        f"FROM {_table(RULE_MOODS_TABLE)}"
    ).collect()[0]
    seeds = {}
    for name, table in (("quality_gates", GATES_TABLE), ("search_queries", SEARCH_QUERIES_TABLE)):
        row = session.sql(
            f"SELECT COUNT(*) AS ROW_COUNT, TO_VARCHAR(HASH_AGG(*)) AS FINGERPRINT "
            f"FROM {_table(table)}"
        ).collect()[0]
        seeds[name] = {
            "table": _table(table),
            "rows": int(row["ROW_COUNT"]),
            "fingerprint": row["FINGERPRINT"],
        }

    return {
        "run_id": run_id,
        "training_data": {
            "catalog": {
                "table": _table(CATALOG_TABLE),
                "rows": int(catalog["ROW_COUNT"]),
                "fingerprint": catalog["FINGERPRINT"],
                "fingerprint_columns": CATALOG_FINGERPRINT_COLUMNS,
                "exported_at": catalog["EXPORTED_AT"],
            },
            "rule_moods": {
                "table": _table(RULE_MOODS_TABLE),
                "rows": int(rule_moods["ROW_COUNT"]),
                "fingerprint": rule_moods["FINGERPRINT"],
                "fingerprint_columns": RULE_MOODS_FINGERPRINT_COLUMNS,
                "mood_mapping_versions": rule_moods["MAPPING_VERSIONS"],
            },
        },
        "evaluation": seeds,
        "settings": {
            "embedding_dimensions": EMBEDDING_DIMENSIONS,
            "minimum_overview_length": MINIMUM_OVERVIEW_LENGTH,
            "cross_validation_folds": CROSS_VALIDATION_FOLDS,
            "random_seed": RANDOM_SEED,
            "disagreement_high": DISAGREEMENT_HIGH,
            "disagreement_low": DISAGREEMENT_LOW,
            "search_top_k": SEARCH_TOP_K,
            "moods": list(MOODS),
        },
        "code": {
            "module": "warehouse/snowpark/title_models.py",
            "sha256": module_checksum(),
            "model_version": MODEL_VERSION,
        },
        "libraries": {
            "python": sys.version.split()[0],
            "scikit_learn": sklearn.__version__,
            "numpy": np.__version__,
        },
    }


def train_procedure(session: Any) -> dict[str, Any]:
    """Handler for AI.TRAIN_TITLE_MODELS(). Trains a candidate, checks it
    against the quality gates, and promotes it only if every gate passes.

    Order matters. Metrics and gate results are written for every run. For
    a promoted run, its outputs are written next. The run row in
    AI.MODEL_RUNS is written last: the live views follow the newest promoted
    run, so they switch to the new model in that one step, never halfway.

    Reads and writes use plain Python rows (collect and create_dataframe on
    lists) instead of pandas. Snowpark's pandas transfer also needs pyarrow,
    which the stored procedure environment did not provide, and plain rows
    are fast enough for a few thousand titles.
    """
    import joblib

    run_id = uuid.uuid4().hex

    # Inputs, the gates, and the live model to compare against ------------
    title_rows = (
        session.table(_table(CATALOG_TABLE))
        .select("TITLE_KEY", "MEDIA_TYPE", "TITLE", "OVERVIEW", "SEARCH_DOCUMENT", "GENRE_NAMES")
        .sort("TITLE_KEY")
        .collect()
    )
    rule_rows = session.table(_table(RULE_MOODS_TABLE)).select("TITLE_KEY", "MOOD").collect()
    gates = read_gates(session)
    queries = read_search_queries(session)
    live_run_id, live_values = read_live_metrics(session)
    lineage = collect_lineage(session, run_id)

    # Model 1: embeddings for every title -------------------------------------
    # n_components is passed explicitly so it always follows the module
    # setting, including in tests that shrink it.
    embedding = fit_embeddings(
        [_text_or_empty(row["SEARCH_DOCUMENT"]) for row in title_rows],
        n_components=EMBEDDING_DIMENSIONS,
    )

    # Model 2: mood classifier on titles with a usable overview --------------
    usable = [row for row in title_rows if has_usable_overview(row["OVERVIEW"])]
    usable_keys = [row["TITLE_KEY"] for row in usable]
    texts = [classifier_text(row["TITLE"], row["OVERVIEW"]) for row in usable]
    labels = build_label_matrix(
        usable_keys, [(row["TITLE_KEY"], row["MOOD"]) for row in rule_rows]
    )
    moods = train_mood_classifier(texts, labels)

    probabilities = moods.out_of_fold_probabilities
    prediction_rows = []
    for row_index, title_key in enumerate(usable_keys):
        for mood_index, mood in enumerate(MOODS):
            probability = float(probabilities[row_index, mood_index])
            rule_label = int(labels[row_index, mood_index])
            prediction_rows.append(
                (
                    title_key,
                    mood,
                    round(probability, 4),
                    probability >= 0.5,
                    bool(rule_label),
                    # "none" instead of NULL keeps the column typed as text
                    # even if a run finds no disagreements at all.
                    disagreement_kind(probability, rule_label) or "none",
                )
            )
    disagreements = sum(1 for row in prediction_rows if row[5] != "none")

    # Search check with the candidate, before anything goes live -------------
    query_vectors = (
        embedding.pipeline.transform([query.search_text for query in queries])
        if queries
        else np.zeros((0, embedding.dimensions))
    )
    search = search_precision_at_k(
        np.asarray(query_vectors, dtype=np.float64),
        embedding.vectors,
        [row["MEDIA_TYPE"] for row in title_rows],
        [genre_list(row["GENRE_NAMES"]) for row in title_rows],
        queries,
    )

    # Gates ----------------------------------------------------------------------
    values = run_metric_values(
        embedding, moods, search, len(title_rows), len(usable), disagreements
    )
    results = evaluate_gates(values, gates, live_values)
    results.append(storage_contract_result(embedding.dimensions))
    failed = [result for result in results if not result.passed]
    status = "rejected" if failed else "promoted"

    # Keep every run's fitted embedder, so any run can be reproduced or
    # restored. Only a promoted run replaces the file AI.EMBED_TEXT loads.
    directory = tempfile.gettempdir()
    run_file = os.path.join(directory, f"title_embedder_{run_id}.joblib")
    joblib.dump(embedding.pipeline, run_file)
    session.file.put(
        run_file, f"@{_table(MODEL_STAGE)}/runs", auto_compress=False, overwrite=True
    )

    # Metrics and gate results, for every run --------------------------------
    _insert_json_rows(
        session,
        RUN_METRICS_TABLE,
        METRIC_COLUMNS,
        [
            {
                "run_id": run_id,
                "metric_name": name,
                "scope": scope,
                "metric_value": _float_or_none(value),
                "model_version": MODEL_VERSION,
            }
            for (name, scope), value in sorted(values.items())
        ],
    )
    _insert_json_rows(
        session,
        GATE_RESULTS_TABLE,
        GATE_RESULT_COLUMNS,
        [
            {
                "run_id": run_id,
                "gate_id": result.gate_id,
                "metric_name": result.metric_name,
                "scope": result.scope,
                "metric_value": _float_or_none(result.metric_value),
                "min_value": _float_or_none(result.min_value),
                "live_value": _float_or_none(result.live_value),
                "max_drop": _float_or_none(result.max_drop),
                "passed": result.passed,
                "reason": result.reason,
            }
            for result in results
        ],
    )

    # Outputs, for a promoted run only ------------------------------------------
    if status == "promoted":
        embedding_rows = [
            (
                row["TITLE_KEY"],
                row["MEDIA_TYPE"],
                # JSON text loads as a plain string column; SQL casts it to VECTOR.
                json.dumps([round(float(value), EMBEDDING_STORAGE_DECIMALS) for value in vector]),
            )
            for row, vector in zip(title_rows, embedding.vectors)
        ]
        embeddings_load = _table("AI.TITLE_EMBEDDINGS_LOAD")
        session.create_dataframe(
            embedding_rows, schema=["TITLE_KEY", "MEDIA_TYPE", "EMBEDDING_JSON"]
        ).write.save_as_table(embeddings_load, mode="overwrite", table_type="transient")
        session.sql(
            f"INSERT INTO {_table(EMBEDDINGS_HISTORY_TABLE)} "
            f"(RUN_ID, TITLE_KEY, MEDIA_TYPE, EMBEDDING, MODEL_VERSION, TRAINED_AT) "
            f"SELECT '{run_id}', TITLE_KEY, MEDIA_TYPE, "
            f"PARSE_JSON(EMBEDDING_JSON)::ARRAY::VECTOR(FLOAT, {EMBEDDING_DIMENSIONS}), "
            f"'{MODEL_VERSION}', CURRENT_TIMESTAMP() "
            f"FROM {embeddings_load}"
        ).collect()
        session.sql(f"DROP TABLE IF EXISTS {embeddings_load}").collect()

        predictions_load = _table("AI.TITLE_MOODS_PREDICTED_LOAD")
        session.create_dataframe(
            prediction_rows,
            schema=["TITLE_KEY", "MOOD", "PROBABILITY", "PREDICTED", "RULE_LABEL", "DISAGREEMENT"],
        ).write.save_as_table(predictions_load, mode="overwrite", table_type="transient")
        session.sql(
            f"INSERT INTO {_table(PREDICTIONS_HISTORY_TABLE)} "
            f"(RUN_ID, TITLE_KEY, MOOD, PROBABILITY, PREDICTED, RULE_LABEL, DISAGREEMENT, MODEL_VERSION) "
            f"SELECT '{run_id}', TITLE_KEY, MOOD, PROBABILITY, PREDICTED, RULE_LABEL, DISAGREEMENT, "
            f"'{MODEL_VERSION}' "
            f"FROM {predictions_load}"
        ).collect()
        session.sql(f"DROP TABLE IF EXISTS {predictions_load}").collect()

        live_file = os.path.join(directory, EMBEDDER_FILE_NAME)
        joblib.dump(embedding.pipeline, live_file)
        session.file.put(
            live_file, f"@{_table(MODEL_STAGE)}", auto_compress=False, overwrite=True
        )

    summary = {
        "run_id": run_id,
        "status": status,
        "live_run_before": live_run_id,
        "failed_gates": {result.gate_id: result.reason for result in failed},
        "model_version": MODEL_VERSION,
        "titles_embedded": len(title_rows),
        "embedding_dimensions": embedding.dimensions,
        "vocabulary_size": embedding.vocabulary_size,
        "explained_variance": round(embedding.explained_variance, 4),
        "mood_titles": len(usable),
        "mood_cv_folds": moods.folds,
        "mood_micro_f1": moods.micro_f1,
        "search_mean_precision_at_10": values.get(
            (f"search_mean_precision_at_{SEARCH_TOP_K}", "all")
        ),
        "confident_disagreements": disagreements,
    }

    # Last: the run row. For a promoted run, this is the step that switches
    # the live views to the new model.
    session.sql(
        f"INSERT INTO {_table(RUNS_TABLE)} (RUN_AT, SUMMARY, RUN_ID, STATUS, LINEAGE) "
        f"SELECT CURRENT_TIMESTAMP(), PARSE_JSON('{_json_literal(summary)}'), "
        f"'{run_id}', '{status}', PARSE_JSON('{_json_literal(lineage)}')"
    ).collect()

    return summary


_EMBEDDER: Pipeline | None = None


def embed_text_udf(text: Any) -> list[float] | None:
    """Handler for AI.EMBED_TEXT(text). Loads the saved pipeline once per process."""
    global _EMBEDDER

    if not _text_or_empty(text):
        return None

    if _EMBEDDER is None:
        import joblib

        import_directory = sys._xoptions["snowflake_import_directory"]
        _EMBEDDER = joblib.load(os.path.join(import_directory, EMBEDDER_FILE_NAME))

    vector = _EMBEDDER.transform([text])[0]
    return [float(value) for value in vector]
