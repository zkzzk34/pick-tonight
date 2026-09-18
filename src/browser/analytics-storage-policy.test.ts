import { describe, expect, it } from "vitest";

import HOG_SOURCE from "../../docs/posthog/picktonight-property-allowlist.hog?raw";
import { PICKTONIGHT_ANALYTICS_EVENT_NAMES } from "./analytics-events";
import { PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST } from "./analytics-property-policy";

function transformationBlocks(): ReadonlyMap<string, string> {
  const matches = [
    ...HOG_SOURCE.matchAll(/if \(event\.event = '([^']+)'\) \{/g),
  ];

  const blocks = new Map<string, string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const eventName = match?.[1];

    if (!eventName || match.index === undefined) {
      throw new Error("Malformed PostHog event transformation branch.");
    }

    const nextIndex = matches[index + 1]?.index ?? HOG_SOURCE.length;

    blocks.set(eventName, HOG_SOURCE.slice(match.index, nextIndex));
  }

  return blocks;
}

describe("Issue #35 PostHog storage allowlist", () => {
  it("covers exactly the reviewed analytics event vocabulary", () => {
    expect([...transformationBlocks().keys()]).toEqual([
      ...PICKTONIGHT_ANALYTICS_EVENT_NAMES,
    ]);
  });

  it("keeps every storage branch synchronized with the browser property allowlist", () => {
    const blocks = transformationBlocks();

    for (const eventName of PICKTONIGHT_ANALYTICS_EVENT_NAMES) {
      const block = blocks.get(eventName);

      expect(block, `Missing Hog branch for ${eventName}`).toBeDefined();

      const referencedProperties = [
        ...new Set(
          [
            ...(block ?? "").matchAll(/event\.properties\.([A-Za-z0-9_$]+)/g),
          ].map((match) => match[1]),
        ),
      ].sort();

      const expectedProperties = [
        ...PICKTONIGHT_ANALYTICS_PROPERTY_ALLOWLIST[eventName],
      ].sort();

      expect(
        referencedProperties,
        `Storage allowlist drift for ${eventName}`,
      ).toEqual(expectedProperties);
    }
  });
});
