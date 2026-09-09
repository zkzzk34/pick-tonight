import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_MOODS,
  type SupportedMood,
} from "../shared/recommendation-contracts.ts";
import {
  getMoodMapping,
  isSupportedMood,
  MOOD_MAPPING_CONFIGURATION,
  MOOD_MAPPING_VERSION,
  type MoodSignal,
} from "./mood-mapping.ts";

const EXPECTED_SIGNAL_SIGNATURES = {
  relaxed: [
    "genre:movie,tv:16:Animation",
    "genre:movie,tv:10751:Family",
    "genre:movie:10402:Music",
  ],
  laughing: ["genre:movie,tv:35:Comedy"],
  excited: [
    "genre:movie:28:Action",
    "genre:movie:12:Adventure",
    "genre:movie:53:Thriller",
    "genre:tv:10759:Action & Adventure",
  ],
  thoughtful: [
    "genre:movie,tv:18:Drama",
    "genre:movie,tv:99:Documentary",
    "genre:movie:36:History",
  ],
  romantic: ["genre:movie:10749:Romance", "genre:tv:18:Drama"],
  spooked: [
    "genre:movie:27:Horror",
    "genre:movie:53:Thriller",
    "genre:movie,tv:9648:Mystery",
  ],
  surprised: ["discovery:cross-genre-variety"],
} as const satisfies Readonly<Record<SupportedMood, readonly string[]>>;

function signalSignature(signal: MoodSignal): string {
  return signal.kind === "genre"
    ? `genre:${signal.mediaTypes.join(",")}:${signal.genreId}:${signal.genreName}`
    : `discovery:${signal.key}`;
}

test("defines one recommendation-v1 mapping for every supported mood", () => {
  assert.equal(MOOD_MAPPING_VERSION, "recommendation-v1");
  assert.equal(MOOD_MAPPING_CONFIGURATION.version, MOOD_MAPPING_VERSION);
  assert.deepEqual(Object.keys(MOOD_MAPPING_CONFIGURATION.mappings), [
    ...SUPPORTED_MOODS,
  ]);
});

for (const mood of SUPPORTED_MOODS) {
  test(`maps ${mood} to explicit explainable signals`, () => {
    assert.equal(isSupportedMood(mood), true);

    const mapping = getMoodMapping(mood);
    assert.ok(mapping);
    assert.strictEqual(mapping, MOOD_MAPPING_CONFIGURATION.mappings[mood]);
    assert.ok(mapping.intent.trim().length > 0);
    assert.deepEqual(
      mapping.signals.map(signalSignature),
      EXPECTED_SIGNAL_SIGNATURES[mood],
    );

    for (const signal of mapping.signals) {
      assert.ok(signal.explanation.trim().length > 0);

      if (signal.kind === "genre") {
        assert.equal(Number.isInteger(signal.genreId), true);
        assert.ok(signal.genreId > 0);
        assert.ok(signal.genreName.trim().length > 0);
        assert.ok(signal.mediaTypes.length > 0);
        assert.equal(new Set(signal.mediaTypes).size, signal.mediaTypes.length);
        assert.equal(
          signal.mediaTypes.every(
            (mediaType) => mediaType === "movie" || mediaType === "tv",
          ),
          true,
        );
      }
    }
  });
}

test("rejects unsupported mood input without inventing a mapping", () => {
  const unsupportedInputs: unknown[] = [
    undefined,
    null,
    "",
    "calm",
    "RELAXED",
    0,
    false,
    {},
    [],
  ];

  for (const input of unsupportedInputs) {
    assert.equal(isSupportedMood(input), false);
    assert.equal(getMoodMapping(input), null);
  }
});
