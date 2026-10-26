import assert from "node:assert/strict";
import test from "node:test";

import { SUPPORTED_MOODS } from "../../src/shared/recommendation-contracts.ts";
import { RECOMMENDATION_HEURISTIC_VERSION } from "../../src/shared/recommendation-version.ts";
import {
  generateSyntheticEvents,
  TAXONOMY_V3_EVENTS,
  toCsv,
} from "./generate-synthetic-events.ts";

const SHARED_PROPERTIES = [
  "taxonomy_version",
  "ui_locale",
  "analytics_environment",
  "traffic_class",
  "session_id",
];

/** Properties docs/event-taxonomy.md allows on any event. */
const ALLOWED_PROPERTIES = new Set([
  ...SHARED_PROPERTIES,
  "response",
  "step",
  "reason",
  "recommendation_session_id",
  "algorithm_version",
  "used_typed_input",
  "required_restriction_count",
  "soft_preference_count",
  "media_type_code",
  "mood_code",
  "companion_code",
  "maximum_runtime_minutes",
  "freshness_year",
  "batch_sequence",
  "recommendation_count",
  "recommendation_item_id",
  "media_type",
  "position",
  "impression_sequence",
  "candidate_age_code",
  "rating_confidence_code",
  "provider_claim_status",
  "repeat_status",
  "persistence",
  "rejection_reason",
  "feedback_reason",
  "originating_action",
  "error_kind",
]);

test("the same seed always produces the same events", () => {
  const first = generateSyntheticEvents({ sessions: 25, seed: 7 });
  const second = generateSyntheticEvents({ sessions: 25, seed: 7 });
  assert.deepEqual(first, second);
});

test("every event follows the taxonomy v3 contract", () => {
  const events = generateSyntheticEvents({ sessions: 400 });
  const knownEvents: ReadonlySet<string> = new Set(TAXONOMY_V3_EVENTS);

  for (const event of events) {
    assert.ok(knownEvents.has(event.event), event.event);
    assert.ok(event.distinct_id.startsWith("synthetic-"));
    assert.ok(!Number.isNaN(Date.parse(event.timestamp)));

    for (const name of SHARED_PROPERTIES) {
      assert.ok(name in event.properties, `${event.event} lacks ${name}`);
    }

    assert.equal(event.properties.taxonomy_version, 3);
    assert.equal(event.properties.ui_locale, "en-US");

    for (const name of Object.keys(event.properties)) {
      assert.ok(ALLOWED_PROPERTIES.has(name), `unexpected property ${name}`);
    }

    if ("algorithm_version" in event.properties) {
      assert.equal(
        event.properties.algorithm_version,
        RECOMMENDATION_HEURISTIC_VERSION,
      );
    }

    if ("mood_code" in event.properties) {
      assert.ok(
        (SUPPORTED_MOODS as readonly unknown[]).includes(
          event.properties.mood_code,
        ),
      );
    }
  }
});

test("journeys contain the full funnel with realistic drop-off", () => {
  const events = generateSyntheticEvents({ sessions: 600 });
  const count = (name: string) =>
    events.filter((event) => event.event === name).length;

  assert.equal(count("app_opened"), 600);
  assert.ok(count("picker_started") < count("app_opened"));
  assert.ok(count("context_submitted") < count("picker_started"));
  assert.ok(count("recommendation_batch_viewed") <= count("context_submitted"));
  assert.ok(count("watch_intent_confirmed") > 0);
  assert.ok(
    count("watch_intent_confirmed") < count("recommendation_batch_viewed"),
  );

  // Every one of the 17 events should appear at this volume.
  for (const name of TAXONOMY_V3_EVENTS) {
    assert.ok(count(name) > 0, `${name} never generated`);
  }
});

test("events within a session are in time order", () => {
  const events = generateSyntheticEvents({ sessions: 50 });
  const lastSeen = new Map<string, number>();

  for (const event of events) {
    const at = Date.parse(event.timestamp);
    const previous = lastSeen.get(event.distinct_id);
    assert.ok(previous === undefined || at > previous);
    lastSeen.set(event.distinct_id, at);
  }
});

test("CSV output quotes the JSON properties column", () => {
  const csv = toCsv(generateSyntheticEvents({ sessions: 1 }));
  const [header, firstRow] = csv.split("\n");
  assert.equal(header, "uuid,event,timestamp,distinct_id,properties");
  assert.match(firstRow ?? "", /,"\{""taxonomy_version"":3,/);
  assert.ok(csv.endsWith("\n"));
});

test("a non-positive session count is refused", () => {
  assert.throws(() => generateSyntheticEvents({ sessions: 0 }), /positive/);
});
