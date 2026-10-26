"""Local tests for title_models.py. They need no Snowflake connection.

Run from the repository root (needs scikit-learn and numpy):
    python3 -m unittest discover -s warehouse/snowpark -v
"""

import unittest

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


if __name__ == "__main__":
    unittest.main()
