"""Local tests for title_models.py. They need no Snowflake connection.

Run from the repository root (needs scikit-learn and numpy):
    python3 -m unittest discover -s warehouse/snowpark -v
"""

import json
import os
import tempfile
import unittest
from unittest import mock

import numpy as np

import title_models as tm

# A tiny catalog where each "mood" has its own vocabulary.
CATALOG = [
    ("movie:1", "Laugh Riot", "A hilarious comedy about clumsy friends and silly pranks at a wedding."),
    ("movie:2", "Joke Night", "Stand up comedians trade jokes and silly pranks in a hilarious contest."),
    ("movie:3", "Prank Week", "Clumsy roommates pull hilarious pranks and the jokes never stop."),
    ("movie:4", "Dark House", "A terrifying ghost haunts a family in a dark house full of screams."),
    ("movie:5", "The Cellar", "Something terrifying waits in the dark cellar and the screams begin."),
    ("movie:6", "Night Ghost", "A ghost stalks campers in the dark woods with terrifying screams."),
    ("movie:7", "Love Letters", "Two strangers fall in love through letters and a romantic summer."),
    ("movie:8", "Paris Hearts", "A romantic love story between a painter and a baker in Paris."),
    ("movie:9", "Second Chance", "Old flames fall in love again on a romantic island summer."),
    ("movie:10", "Quiet Garden", "A gentle animated story of a family garden and calm seasons."),
    ("movie:11", "Cloud Friends", "Animated friends drift through calm clouds on a gentle family trip."),
    ("movie:12", "Sea Lullaby", "A gentle animated whale sings calm songs for her family."),
]

RULES = [
    ("movie:1", "laughing"),
    ("movie:2", "laughing"),
    ("movie:3", "laughing"),
    ("movie:4", "spooked"),
    ("movie:5", "spooked"),
    ("movie:6", "spooked"),
    ("movie:7", "romantic"),
    ("movie:8", "romantic"),
    ("movie:9", "romantic"),
    ("movie:10", "relaxed"),
    ("movie:11", "relaxed"),
    ("movie:12", "relaxed"),
]

SMALL_MOODS = ("laughing", "spooked", "romantic", "relaxed")


class EmbeddingTests(unittest.TestCase):
    def setUp(self):
        self.documents = [f"{title}. {overview}" for _, title, overview in CATALOG]
        self.result = tm.fit_embeddings(self.documents, n_components=6)

    def test_vectors_are_unit_length(self):
        norms = np.linalg.norm(self.result.vectors, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-6)

    def test_dimensions_shrink_to_fit_a_small_catalog(self):
        result = tm.fit_embeddings(self.documents, n_components=500)
        self.assertLess(result.dimensions, len(self.documents))
        self.assertEqual(result.vectors.shape, (len(self.documents), result.dimensions))

    def test_similar_titles_are_closer_than_different_ones(self):
        vectors = self.result.vectors
        comedy_pair = float(vectors[0] @ vectors[1])
        comedy_vs_horror = float(vectors[0] @ vectors[3])
        self.assertGreater(comedy_pair, comedy_vs_horror)

    def test_a_query_lands_near_matching_titles(self):
        query = self.result.pipeline.transform(["terrifying ghost screams in the dark"])[0]
        scores = self.result.vectors @ query
        best = int(np.argmax(scores))
        self.assertIn(CATALOG[best][0], {"movie:4", "movie:5", "movie:6"})

    def test_too_few_documents_are_refused(self):
        with self.assertRaises(ValueError):
            tm.fit_embeddings(["one", "two"])


class LabelTests(unittest.TestCase):
    def test_label_matrix_marks_rule_moods(self):
        labels = tm.build_label_matrix(
            ["movie:1", "movie:4"],
            [("movie:1", "laughing"), ("movie:4", "spooked"), ("tv:9", "laughing")],
            moods=SMALL_MOODS,
        )
        np.testing.assert_array_equal(labels, [[1, 0, 0, 0], [0, 1, 0, 0]])

    def test_classifier_text_leaves_genres_out(self):
        self.assertEqual(tm.classifier_text("Alpha", "An overview."), "Alpha. An overview.")
        self.assertEqual(tm.classifier_text("Alpha", None), "Alpha.")

    def test_short_overviews_are_not_usable(self):
        self.assertFalse(tm.has_usable_overview(None))
        self.assertFalse(tm.has_usable_overview("Too short."))
        self.assertTrue(tm.has_usable_overview("A long enough overview for training."))


class MoodClassifierTests(unittest.TestCase):
    def setUp(self):
        keys = [key for key, _, _ in CATALOG]
        # Repeat the catalog so the split leaves examples of every mood.
        self.texts = [tm.classifier_text(title, overview) for _, title, overview in CATALOG] * 4
        self.labels = np.vstack([tm.build_label_matrix(keys, RULES, moods=SMALL_MOODS)] * 4)

    def test_metrics_cover_every_mood(self):
        result = tm.train_mood_classifier(self.texts, self.labels, moods=SMALL_MOODS)
        self.assertEqual([row["mood"] for row in result.metrics], list(SMALL_MOODS))
        for row in result.metrics:
            self.assertGreaterEqual(row["f1"], 0.0)
            self.assertLessEqual(row["f1"], 1.0)
        self.assertEqual(result.folds, 5)
        self.assertEqual(result.out_of_fold_probabilities.shape, self.labels.shape)
        self.assertTrue(np.all(result.out_of_fold_probabilities >= 0))
        self.assertTrue(np.all(result.out_of_fold_probabilities <= 1))

    def test_learns_mood_vocabulary(self):
        result = tm.train_mood_classifier(self.texts, self.labels, moods=SMALL_MOODS)
        self.assertGreater(result.micro_f1, 0.8)
        probabilities = result.model.predict_proba(["a hilarious comedy full of silly jokes"])[0]
        self.assertEqual(SMALL_MOODS[int(np.argmax(probabilities))], "laughing")

    def test_a_mood_without_examples_is_refused(self):
        labels = self.labels.copy()
        labels[:, 0] = 0
        with self.assertRaisesRegex(ValueError, "laughing"):
            tm.train_mood_classifier(self.texts, labels, moods=SMALL_MOODS)


class DisagreementTests(unittest.TestCase):
    def test_confident_disagreements_are_named(self):
        self.assertEqual(tm.disagreement_kind(0.9, 0), "text_suggests_mood_rules_miss")
        self.assertEqual(tm.disagreement_kind(0.1, 1), "rules_give_mood_text_does_not_support")
        self.assertIsNone(tm.disagreement_kind(0.6, 0))
        self.assertIsNone(tm.disagreement_kind(0.6, 1))


class SearchPrecisionTests(unittest.TestCase):
    def setUp(self):
        # Three movies and one TV title in a two-dimension space.
        self.vectors = np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [1.0, 0.0]])
        self.media_types = ["movie", "movie", "movie", "tv"]
        self.genres = [["Horror"], ["Horror", "Thriller"], ["Romance"], ["Horror"]]

    def score(self, query, vector, k=2):
        return tm.search_precision_at_k(
            np.array([vector]), self.vectors, self.media_types, self.genres, [query], k=k
        )[0]

    def test_counts_hits_in_the_top_results(self):
        query = tm.SearchQuery("horror", "ghosts", "Horror", "movie")
        self.assertEqual(
            self.score(query, [1.0, 0.0]),
            {"query_id": "horror", "hits": 2, "precision_at_k": 1.0},
        )

    def test_only_titles_of_the_query_media_type_count(self):
        query = tm.SearchQuery("horror_tv", "ghosts", "Horror", "tv")
        # One TV title exists, so 1 hit out of k=2.
        self.assertEqual(self.score(query, [1.0, 0.0])["precision_at_k"], 0.5)

    def test_a_wrong_genre_is_a_miss(self):
        query = tm.SearchQuery("romance", "love", "Romance", "movie")
        self.assertEqual(self.score(query, [1.0, 0.0])["hits"], 0)

    def test_genres_arrive_as_json_text_from_snowpark(self):
        self.assertEqual(tm.genre_list('[\n  "Action",\n  "Drama"\n]'), ["Action", "Drama"])
        self.assertEqual(tm.genre_list(["Action"]), ["Action"])
        self.assertEqual(tm.genre_list(None), [])


class GateTests(unittest.TestCase):
    GATE = tm.Gate("mood_f1__laughing", "mood_f1", "laughing", 0.50, 0.05)
    KEY = ("mood_f1", "laughing")

    def check(self, value, live=None):
        live_values = {self.KEY: live} if live is not None else {}
        return tm.evaluate_gates({self.KEY: value}, [self.GATE], live_values)[0]

    def test_passes_above_the_floor_with_no_live_model(self):
        self.assertTrue(self.check(0.60).passed)

    def test_fails_below_the_floor(self):
        result = self.check(0.49)
        self.assertFalse(result.passed)
        self.assertIn("below the floor", result.reason)

    def test_fails_when_it_drops_too_far_below_the_live_model(self):
        result = self.check(0.60, live=0.70)
        self.assertFalse(result.passed)
        self.assertIn("below the live model", result.reason)

    def test_a_drop_within_the_limit_passes(self):
        self.assertTrue(self.check(0.66, live=0.70).passed)
        # Exactly max_drop below is allowed.
        self.assertTrue(self.check(0.65, live=0.70).passed)

    def test_an_unmeasured_metric_fails(self):
        result = tm.evaluate_gates({}, [self.GATE])[0]
        self.assertFalse(result.passed)
        self.assertIsNone(result.metric_value)

    def test_no_gates_means_no_promotion(self):
        with self.assertRaises(ValueError):
            tm.evaluate_gates({self.KEY: 0.9}, [])

    def test_vector_size_is_a_built_in_gate(self):
        self.assertTrue(tm.storage_contract_result(tm.EMBEDDING_DIMENSIONS).passed)
        self.assertFalse(tm.storage_contract_result(tm.EMBEDDING_DIMENSIONS - 1).passed)


# --------------------------------------------------------------------------
# The whole procedure, against a fake Snowpark session
# --------------------------------------------------------------------------

MOOD_TITLES = {
    "laughing": ("Comedy", [title for _, title, _ in CATALOG[0:3]], [o for _, _, o in CATALOG[0:3]]),
    "spooked": ("Horror", [title for _, title, _ in CATALOG[3:6]], [o for _, _, o in CATALOG[3:6]]),
    "romantic": ("Romance", [title for _, title, _ in CATALOG[6:9]], [o for _, _, o in CATALOG[6:9]]),
    "relaxed": ("Animation", [title for _, title, _ in CATALOG[9:12]], [o for _, _, o in CATALOG[9:12]]),
    "excited": (
        "Action",
        ["Turbo Chase", "Final Heist", "Sky Strike"],
        [
            "A high speed car chase with explosions, heists and daring stunts.",
            "Daring thieves plan an explosive heist with car chases and stunts.",
            "Fighter pilots race through explosions in a daring high speed mission.",
        ],
    ),
    "thoughtful": (
        "Drama",
        ["Quiet Truth", "The Archive", "Long Winter"],
        [
            "A grieving philosopher reflects on memory, loss and the meaning of truth.",
            "A historian reflects on memory and loss while uncovering a quiet truth.",
            "A lonely professor reflects on grief, memory and the meaning of life.",
        ],
    ),
}


def fake_catalog(copies=3):
    """Catalog rows shaped like DBT_MARTS.TITLE_CATALOG_CURRENT, plus rules."""
    titles, rules = [], []
    for copy in range(copies):
        for mood, (genre, names, overviews) in MOOD_TITLES.items():
            for index, (name, overview) in enumerate(zip(names, overviews)):
                key = f"movie:{mood}-{index}-{copy}"
                titles.append(
                    {
                        "TITLE_KEY": key,
                        "MEDIA_TYPE": "movie",
                        "TITLE": name,
                        "OVERVIEW": overview,
                        "SEARCH_DOCUMENT": f"{name}. {genre}. {overview}",
                        # Snowpark returns ARRAY columns as JSON text.
                        "GENRE_NAMES": json.dumps([genre]),
                    }
                )
                rules.append({"TITLE_KEY": key, "MOOD": mood})
    return titles, rules


def gate_row(gate_id, metric_name, scope, min_value, max_drop):
    return {
        "GATE_ID": gate_id,
        "METRIC_NAME": metric_name,
        "SCOPE": scope,
        "MIN_VALUE": min_value,
        "MAX_DROP": max_drop,
    }


PASSABLE_GATES = [
    gate_row("mood_micro_f1", "mood_micro_f1", "all", 0.0, 0.05),
    gate_row("search_mean_precision_at_10", "search_mean_precision_at_10", "all", 0.0, 0.05),
    gate_row("embedding_dimensions", "embedding_dimensions", "all", 8, 0),
]

SEARCH_QUERIES = [
    {"QUERY_ID": "horror", "SEARCH_TEXT": "a terrifying ghost screams in a dark house",
     "EXPECTED_GENRE": "Horror", "MEDIA_TYPE": "movie"},
    {"QUERY_ID": "romance", "SEARCH_TEXT": "strangers fall in love on a romantic summer",
     "EXPECTED_GENRE": "Romance", "MEDIA_TYPE": "movie"},
]


class FakeFrame:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *columns):
        return FakeFrame([{column: row[column] for column in columns} for row in self.rows])

    def sort(self, column):
        return FakeFrame(sorted(self.rows, key=lambda row: row[column]))

    def collect(self):
        return list(self.rows)


class FakeWriter:
    def __init__(self, session, rows):
        self.session, self.rows = session, rows

    def save_as_table(self, name, mode=None, table_type=None):
        self.session.saved.append((name, mode, len(self.rows)))


class FakeDataFrame:
    def __init__(self, session, rows):
        self.write = FakeWriter(session, rows)


class FakeFiles:
    def __init__(self, session):
        self.session = session

    def put(self, local_path, stage, auto_compress=True, overwrite=False):
        self.session.puts.append((os.path.basename(local_path), stage))


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def collect(self):
        return self.rows


class FakeSession:
    """Just enough of a Snowpark session to run train_procedure end to end."""

    def __init__(self, gates, live_values=None):
        titles, rules = fake_catalog()
        self.tables = {
            tm._table(tm.CATALOG_TABLE): titles,
            tm._table(tm.RULE_MOODS_TABLE): rules,
            tm._table(tm.GATES_TABLE): gates,
            tm._table(tm.SEARCH_QUERIES_TABLE): SEARCH_QUERIES,
        }
        self.live_values = live_values
        self.statements, self.saved, self.puts = [], [], []
        self.file = FakeFiles(self)

    def table(self, name):
        return FakeFrame(self.tables[name])

    def create_dataframe(self, rows, schema):
        return FakeDataFrame(self, rows)

    def sql(self, text):
        self.statements.append(text)
        if "HASH_AGG" in text:
            return FakeQuery([{"ROW_COUNT": 1, "FINGERPRINT": "12345",
                               "EXPORTED_AT": "2026-10-26 10:00:00", "MAPPING_VERSIONS": "v1"}])
        if tm.LIVE_RUN_VIEW in text:
            if self.live_values is None:
                return FakeQuery([])
            return FakeQuery([
                {"RUN_ID": "live-run", "METRIC_NAME": name, "SCOPE": scope, "METRIC_VALUE": value}
                for (name, scope), value in self.live_values.items()
            ])
        return FakeQuery([])

    def inserted(self, table):
        """Statements that insert into a table, by full name."""
        return [text for text in self.statements if text.startswith(f"INSERT INTO {tm._table(table)} ")]

    def json_rows(self, table):
        """The JSON array a FLATTEN insert sent, decoded."""
        text = self.inserted(table)[0]
        literal = text.split("PARSE_JSON('", 1)[1].rsplit("'))) AS f", 1)[0]
        return json.loads(literal.replace("''", "'").replace("\\\\", "\\"))


class TrainProcedureTests(unittest.TestCase):
    def run_procedure(self, gates, live_values=None, dimensions=8):
        session = FakeSession(gates, live_values)
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(tm, "EMBEDDING_DIMENSIONS", dimensions), \
                mock.patch.object(tm.tempfile, "gettempdir", return_value=directory):
            summary = tm.train_procedure(session)
        return session, summary

    def test_a_passing_first_run_is_promoted_with_its_record(self):
        session, summary = self.run_procedure(PASSABLE_GATES)
        self.assertEqual(summary["status"], "promoted")
        self.assertIsNone(summary["live_run_before"])
        # Outputs and the file AI.EMBED_TEXT loads are written...
        self.assertEqual(len(session.inserted(tm.EMBEDDINGS_HISTORY_TABLE)), 1)
        self.assertEqual(len(session.inserted(tm.PREDICTIONS_HISTORY_TABLE)), 1)
        self.assertIn((tm.EMBEDDER_FILE_NAME, f"@{tm._table(tm.MODEL_STAGE)}"), session.puts)
        # ...and the run row comes last, so the live views switch in one step.
        last = session.statements[-1]
        self.assertTrue(last.startswith(f"INSERT INTO {tm._table(tm.RUNS_TABLE)} "))
        self.assertIn("'promoted'", last)
        # Every gate, plus the built-in vector size gate, is recorded.
        results = session.json_rows(tm.GATE_RESULTS_TABLE)
        self.assertEqual(len(results), len(PASSABLE_GATES) + 1)
        self.assertTrue(all(row["passed"] for row in results))
        # Search was scored with the candidate, for every test query.
        metrics = {(row["metric_name"], row["scope"]) for row in session.json_rows(tm.RUN_METRICS_TABLE)}
        self.assertIn(("search_precision_at_10", "horror"), metrics)
        self.assertIn(("search_mean_precision_at_10", "all"), metrics)

    def test_the_run_records_what_it_trained_on(self):
        session, _ = self.run_procedure(PASSABLE_GATES)
        run_row = session.statements[-1]
        lineage_text = run_row.rsplit("PARSE_JSON('", 1)[1].rsplit("')", 1)[0]
        lineage = json.loads(lineage_text.replace("''", "'"))
        self.assertEqual(lineage["training_data"]["catalog"]["fingerprint"], "12345")
        self.assertEqual(
            lineage["training_data"]["catalog"]["fingerprint_columns"],
            tm.CATALOG_FINGERPRINT_COLUMNS,
        )
        self.assertEqual(lineage["code"]["sha256"], tm.module_checksum())
        self.assertEqual(lineage["settings"]["embedding_dimensions"], 8)

    def test_a_failed_gate_keeps_the_live_model(self):
        gates = PASSABLE_GATES + [gate_row("impossible", "mood_micro_f1", "all", 1.01, None)]
        session, summary = self.run_procedure(gates, live_values={("mood_micro_f1", "all"): 0.5})
        self.assertEqual(summary["status"], "rejected")
        self.assertIn("impossible", summary["failed_gates"])
        # No outputs, and the live embedder file is untouched...
        self.assertEqual(session.inserted(tm.EMBEDDINGS_HISTORY_TABLE), [])
        self.assertEqual(session.inserted(tm.PREDICTIONS_HISTORY_TABLE), [])
        self.assertNotIn((tm.EMBEDDER_FILE_NAME, f"@{tm._table(tm.MODEL_STAGE)}"), session.puts)
        # ...but the run, its metrics, and the reasons are still recorded.
        self.assertIn("'rejected'", session.statements[-1])
        self.assertTrue(any(name.startswith("title_embedder_") for name, _ in session.puts))
        failed = [row for row in session.json_rows(tm.GATE_RESULTS_TABLE) if not row["passed"]]
        self.assertEqual([row["gate_id"] for row in failed], ["impossible"])

    def test_a_big_drop_below_the_live_model_is_rejected(self):
        session, summary = self.run_procedure(
            PASSABLE_GATES, live_values={("mood_micro_f1", "all"): 2.0}
        )
        self.assertEqual(summary["status"], "rejected")
        self.assertIn("below the live model", summary["failed_gates"]["mood_micro_f1"])

    def test_a_wrong_vector_size_is_never_promoted(self):
        # The fake catalog is too small for 128 dimensions, so the run makes fewer.
        session, summary = self.run_procedure(PASSABLE_GATES, dimensions=128)
        self.assertEqual(summary["status"], "rejected")
        self.assertIn("embedding_storage_contract", summary["failed_gates"])


if __name__ == "__main__":
    unittest.main()
