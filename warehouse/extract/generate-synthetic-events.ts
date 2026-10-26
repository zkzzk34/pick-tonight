/**
 * Generate synthetic PickTonight analytics events for the Snowflake warehouse.
 *
 * Why this exists: the warehouse needs enough event volume to exercise the
 * funnel models, masking policies, and dashboards, but real pilot participant
 * data stays inside PostHog. These rows follow taxonomy v3 from
 * docs/event-taxonomy.md exactly, so the same SQL works on real exports.
 *
 * Labeling: every synthetic row has a distinct_id that starts with
 * "synthetic-", and the output file name contains "synthetic". The warehouse
 * derives a data_origin column from the file name, so synthetic rows can always
 * be filtered out. Event properties are left exactly as the taxonomy defines.
 *
 * Output matches the PostHog SQL export used for real events:
 *   uuid,event,timestamp,distinct_id,properties
 *
 * The generator is seeded, so the same options always produce the same file.
 *
 * Usage from the repository root:
 *   npm run warehouse:synthetic-events
 *   npm run warehouse:synthetic-events -- --sessions=1500
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { SUPPORTED_MOODS } from "../../src/shared/recommendation-contracts.ts";
import { RECOMMENDATION_HEURISTIC_VERSION } from "../../src/shared/recommendation-version.ts";

export const SYNTHETIC_EVENTS_FILE_NAME = "synthetic_events_v3.csv";
export const DEFAULT_SESSION_COUNT = 600;
const DEFAULT_SEED = 20261026;

/** Synthetic sessions are spread across the pilot window and the weeks after. */
const WINDOW_START = Date.parse("2026-09-29T13:00:00.000Z");
const WINDOW_END = Date.parse("2026-10-25T03:00:00.000Z");

export const TAXONOMY_V3_EVENTS = [
  "app_opened",
  "consent_responded",
  "picker_started",
  "picker_step_completed",
  "picker_abandoned",
  "context_submitted",
  "recommendation_batch_viewed",
  "recommendation_empty_shown",
  "recommendation_item_shown",
  "recommendation_opened",
  "trailer_clicked",
  "recommendation_saved",
  "recommendation_rejected",
  "recommendations_refreshed",
  "watch_intent_confirmed",
  "feedback_submitted",
  "api_error_shown",
] as const;

export type TaxonomyEventName = (typeof TAXONOMY_V3_EVENTS)[number];

type Properties = Record<string, string | number | boolean>;

export interface SyntheticEvent {
  readonly uuid: string;
  readonly event: TaxonomyEventName;
  readonly timestamp: string;
  readonly distinct_id: string;
  readonly properties: Properties;
}

/** mulberry32: a tiny, well-known seeded PRNG. Not for security use. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class SyntheticRandom {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = createRandom(seed);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.next() * (maximum - minimum + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)] as T;
  }

  /** A UUIDv4-shaped identifier drawn from the seeded stream. */
  uuid(): string {
    const hex = Array.from({ length: 32 }, () =>
      Math.floor(this.next() * 16).toString(16),
    );
    hex[12] = "4";
    hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
    const text = hex.join("");
    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
  }
}

export interface GenerateOptions {
  readonly sessions?: number;
  readonly seed?: number;
}

/** Simulate realistic picker journeys that follow taxonomy v3. */
export function generateSyntheticEvents({
  sessions = DEFAULT_SESSION_COUNT,
  seed = DEFAULT_SEED,
}: GenerateOptions = {}): SyntheticEvent[] {
  if (!Number.isInteger(sessions) || sessions < 1) {
    throw new Error("sessions must be a positive integer.");
  }

  const random = new SyntheticRandom(seed);
  const events: SyntheticEvent[] = [];

  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
    const distinctId = `synthetic-${random.uuid()}`;
    const sessionId = random.uuid();
    let clock = random.integer(WINDOW_START, WINDOW_END);

    const shared: Properties = {
      taxonomy_version: 3,
      ui_locale: "en-US",
      analytics_environment: "pilot",
      traffic_class: "participant",
      session_id: sessionId,
    };

    const emit = (event: TaxonomyEventName, extra: Properties = {}) => {
      // Each step lands a few seconds after the previous one.
      clock += random.integer(3, 45) * 1_000;
      events.push({
        uuid: random.uuid(),
        event,
        timestamp: new Date(clock).toISOString(),
        distinct_id: distinctId,
        properties: { ...shared, ...extra },
      });
    };

    emit("app_opened");

    // Returning visitors already consented, so consent fires only sometimes.
    if (random.chance(0.6)) {
      emit("consent_responded", { response: "accepted" });
    }

    if (!random.chance(0.85)) {
      continue;
    }

    emit("picker_started");

    if (random.chance(0.12)) {
      emit("picker_abandoned", {
        reason: random.pick([
          "opened_saved",
          "opened_saved",
          "opened_saved",
          "analytics_reset",
          "all_data_reset",
        ]),
      });
      continue;
    }

    if (!random.chance(0.9)) {
      continue;
    }

    emit("picker_step_completed", { step: "preferences_reviewed" });

    if (!random.chance(0.95)) {
      continue;
    }

    const recommendationScope: Properties = {
      recommendation_session_id: random.uuid(),
      algorithm_version: RECOMMENDATION_HEURISTIC_VERSION,
    };
    const requiredRestrictionCount = random.integer(0, 2);
    const context: Properties = {
      ...recommendationScope,
      used_typed_input: random.chance(0.35),
      required_restriction_count: requiredRestrictionCount,
      soft_preference_count: random.integer(0, 3),
      media_type_code: random.pick(["movie", "tv", "either"]),
      mood_code: random.pick(SUPPORTED_MOODS),
      companion_code: random.pick(["alone", "partner", "friends", "family"]),
    };

    if (random.chance(0.3)) {
      context.maximum_runtime_minutes = random.pick([90, 120, 150]);
    }

    if (random.chance(0.25)) {
      context.freshness_year = random.pick([2015, 2020, 2023]);
    }

    emit("context_submitted", context);

    if (random.chance(0.03)) {
      emit("api_error_shown", {
        ...recommendationScope,
        error_kind: random.pick([
          "network",
          "upstream",
          "invalid-response",
          "unknown",
        ]),
      });
      continue;
    }

    // Stricter requests come back empty more often.
    if (random.chance(0.02 + requiredRestrictionCount * 0.03)) {
      emit("recommendation_empty_shown", recommendationScope);
      continue;
    }

    const batchSequence = 1;
    let impressionSequence = 0;
    const mediaTypeCode = context.media_type_code;

    const showItem = (position: number) => {
      impressionSequence += 1;
      const item: Properties = {
        ...recommendationScope,
        recommendation_item_id: random.uuid(),
        media_type:
          mediaTypeCode === "either"
            ? random.pick(["movie", "tv"])
            : String(mediaTypeCode),
        position,
      };

      emit("recommendation_item_shown", {
        ...item,
        batch_sequence: batchSequence,
        impression_sequence: impressionSequence,
        candidate_age_code: random.pick(["recent", "established", "unknown"]),
        rating_confidence_code: random.pick(["limited", "medium", "strong"]),
        provider_claim_status: random.chance(0.7) ? "claimed" : "not-claimed",
        repeat_status: "first-shown",
      });

      return item;
    };

    emit("recommendation_batch_viewed", {
      ...recommendationScope,
      batch_sequence: batchSequence,
      recommendation_count: 3,
    });

    const slots = [1, 2, 3].map((position) => showItem(position));

    for (let index = 0; index < slots.length; index += 1) {
      const item = slots[index] as Properties;

      if (random.chance(0.35)) {
        emit("recommendation_opened", item);

        if (random.chance(0.35)) {
          emit("trailer_clicked", item);
        }
      }

      if (random.chance(0.15)) {
        emit("recommendation_saved", {
          ...item,
          persistence: random.chance(0.8) ? "persistent" : "session-only",
        });
      }

      if (random.chance(0.18)) {
        const rejectionReason = random.pick([
          "not-tonight",
          "not-my-taste",
          "already-watched",
        ]);
        emit("recommendation_rejected", {
          ...item,
          rejection_reason: rejectionReason,
        });

        if (random.chance(0.4)) {
          emit("feedback_submitted", {
            ...recommendationScope,
            recommendation_item_id: String(item.recommendation_item_id),
            feedback_reason: random.pick([
              "too-long",
              "unavailable",
              "wrong-mood",
              "disliked-genre",
              "rating-content-concern",
              "not-interested",
              "other",
            ]),
            originating_action: rejectionReason,
          });
        }

        // A rejected slot is refilled with a new title.
        slots[index] = showItem(Number(item.position));
      }
    }

    if (random.chance(0.15)) {
      const position = random.integer(1, 3);
      const replacement = showItem(position);
      slots[position - 1] = replacement;
      emit("recommendations_refreshed", {
        ...recommendationScope,
        recommendation_item_id: String(replacement.recommendation_item_id),
        position,
        batch_sequence: batchSequence,
      });
    }

    if (random.chance(0.45)) {
      // Earlier slots get chosen more often, like a real ranked list.
      const position = random.pick([1, 1, 1, 2, 2, 3]);
      emit("watch_intent_confirmed", slots[position - 1] as Properties);
    }
  }

  return events;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(events: readonly SyntheticEvent[]): string {
  const header = "uuid,event,timestamp,distinct_id,properties";
  const rows = events.map((event) =>
    [
      event.uuid,
      event.event,
      event.timestamp,
      event.distinct_id,
      JSON.stringify(event.properties),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { sessions: { type: "string" } },
  });
  const sessions =
    values.sessions === undefined
      ? DEFAULT_SESSION_COUNT
      : Number(values.sessions);
  const outputDirectory = path.resolve("warehouse", "data");
  const events = generateSyntheticEvents({ sessions });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, SYNTHETIC_EVENTS_FILE_NAME),
    toCsv(events),
  );
  console.log(
    `Wrote ${events.length} synthetic events from ${sessions} sessions to ${path.join(outputDirectory, SYNTHETIC_EVENTS_FILE_NAME)}`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
