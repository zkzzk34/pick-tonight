"""Snowpark ML models for the PickTonight catalog.

This module runs inside Snowflake. You upload it to the RAW stage, and
05_snowpark_ml.sql creates two Snowflake objects that import it:

* ``AI.TRAIN_TITLE_MODELS()`` is a Python stored procedure. It reads
  ``MARTS.DIM_TITLE`` and ``MARTS.TITLE_RULE_MOODS``, trains two models with
  scikit-learn on the warehouse, and writes the results back as tables.
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

The pure functions below have no Snowflake dependency, so
``test_title_models.py`` can test them locally.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np
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

DATABASE = "PICKTONIGHT"


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
# Snowflake entry points
# --------------------------------------------------------------------------


def _table(name: str) -> str:
    return f"{DATABASE}.{name}"


def train_procedure(session: Any) -> dict[str, Any]:
    """Handler for AI.TRAIN_TITLE_MODELS(). Returns a run summary.

    Reads and writes use plain Python rows (collect and create_dataframe on
    lists) instead of pandas. Snowpark's pandas transfer also needs pyarrow,
    which the stored procedure environment did not provide, and plain rows
    are fast enough for a few thousand titles.
    """
    import joblib

    title_rows = (
        session.table(_table("MARTS.DIM_TITLE"))
        .select("TITLE_KEY", "MEDIA_TYPE", "TITLE", "OVERVIEW", "SEARCH_DOCUMENT")
        .sort("TITLE_KEY")
        .collect()
    )
    rule_rows = (
        session.table(_table("MARTS.TITLE_RULE_MOODS")).select("TITLE_KEY", "MOOD").collect()
    )

    # Model 1: embeddings for every title -------------------------------------
    embedding = fit_embeddings([_text_or_empty(row["SEARCH_DOCUMENT"]) for row in title_rows])

    embedding_rows = [
        (
            row["TITLE_KEY"],
            row["MEDIA_TYPE"],
            # JSON text loads as a plain string column; SQL casts it to VECTOR.
            json.dumps([round(float(value), 6) for value in vector]),
        )
        for row, vector in zip(title_rows, embedding.vectors)
    ]
    session.create_dataframe(
        embedding_rows, schema=["TITLE_KEY", "MEDIA_TYPE", "EMBEDDING_JSON"]
    ).write.save_as_table(
        _table("AI.TITLE_EMBEDDINGS_LOAD"), mode="overwrite", table_type="transient"
    )
    session.sql(
        f"""
        CREATE OR REPLACE TABLE {_table("AI.TITLE_EMBEDDINGS")} AS
        SELECT
          TITLE_KEY,
          MEDIA_TYPE,
          PARSE_JSON(EMBEDDING_JSON)::ARRAY::VECTOR(FLOAT, {embedding.dimensions}) AS EMBEDDING,
          '{MODEL_VERSION}' AS MODEL_VERSION,
          CURRENT_TIMESTAMP() AS TRAINED_AT
        FROM {_table("AI.TITLE_EMBEDDINGS_LOAD")}
        """
    ).collect()
    session.sql(f"DROP TABLE IF EXISTS {_table('AI.TITLE_EMBEDDINGS_LOAD')}").collect()

    # Save the fitted pipeline so AI.EMBED_TEXT can embed search queries.
    local_path = os.path.join("/tmp", EMBEDDER_FILE_NAME)
    joblib.dump(embedding.pipeline, local_path)
    session.file.put(
        local_path, f"@{_table('AI.MODEL_STAGE')}", auto_compress=False, overwrite=True
    )

    # Model 2: mood classifier on titles with a usable overview --------------
    usable = [row for row in title_rows if has_usable_overview(row["OVERVIEW"])]
    usable_keys = [row["TITLE_KEY"] for row in usable]
    texts = [classifier_text(row["TITLE"], row["OVERVIEW"]) for row in usable]
    labels = build_label_matrix(
        usable_keys, [(row["TITLE_KEY"], row["MOOD"]) for row in rule_rows]
    )
    moods = train_mood_classifier(texts, labels)

    # "_SCORE" suffixes keep column names clear of SQL keywords like PRECISION.
    metric_rows = [
        (
            metric["mood"],
            metric["precision"],
            metric["recall"],
            metric["f1"],
            metric["rule_positives"],
            metric["rule_positive_rate"],
            MODEL_VERSION,
        )
        for metric in moods.metrics
    ]
    session.create_dataframe(
        metric_rows,
        schema=[
            "MOOD",
            "PRECISION_SCORE",
            "RECALL_SCORE",
            "F1_SCORE",
            "RULE_POSITIVES",
            "RULE_POSITIVE_RATE",
            "MODEL_VERSION",
        ],
    ).write.save_as_table(_table("AI.MOOD_MODEL_METRICS"), mode="overwrite")

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
                    MODEL_VERSION,
                )
            )
    session.create_dataframe(
        prediction_rows,
        schema=[
            "TITLE_KEY",
            "MOOD",
            "PROBABILITY",
            "PREDICTED",
            "RULE_LABEL",
            "DISAGREEMENT",
            "MODEL_VERSION",
        ],
    ).write.save_as_table(_table("AI.TITLE_MOODS_PREDICTED"), mode="overwrite")

    disagreements = sum(1 for row in prediction_rows if row[5] != "none")

    summary = {
        "model_version": MODEL_VERSION,
        "titles_embedded": len(title_rows),
        "embedding_dimensions": embedding.dimensions,
        "vocabulary_size": embedding.vocabulary_size,
        "explained_variance": round(embedding.explained_variance, 4),
        "mood_titles": len(usable),
        "mood_cv_folds": moods.folds,
        "mood_micro_f1": moods.micro_f1,
        "confident_disagreements": disagreements,
    }

    # Keep a history of runs so results can be read later with a plain SELECT.
    session.sql(
        f"CREATE TABLE IF NOT EXISTS {_table('AI.MODEL_RUNS')} "
        "(RUN_AT TIMESTAMP_LTZ, SUMMARY VARIANT)"
    ).collect()
    summary_json = json.dumps(summary).replace("'", "''")
    session.sql(
        f"INSERT INTO {_table('AI.MODEL_RUNS')} "
        f"SELECT CURRENT_TIMESTAMP(), PARSE_JSON('{summary_json}')"
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
