import { beforeEach, describe, expect, it } from "vitest";

import {
  ANALYTICS_INTERNAL_SESSION_STORAGE_KEY,
  getAnalyticsRuntimeClassification,
  initializeAnalyticsRuntime,
  prepareAnalyticsInternalQueryMarker,
  prepareAnalyticsRuntime,
  readAnalyticsInternalSessionMarker,
  resetAnalyticsRuntimeForTests,
  resetAnalyticsRuntimeSessionMarker,
  resolveAnalyticsEnvironment,
  type AnalyticsSessionStorage,
} from "./analytics-runtime";

class MemorySessionStorage implements AnalyticsSessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Issue #38 analytics runtime policy", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    resetAnalyticsRuntimeForTests();
  });

  it("accepts the four explicit environment codes", () => {
    for (const analyticsEnvironment of [
      "development",
      "test",
      "preview",
      "pilot",
    ] as const) {
      expect(
        resolveAnalyticsEnvironment({
          configuredEnvironment: analyticsEnvironment,
          viteMode: "production",
          isDevelopment: false,
        }),
      ).toBe(analyticsEnvironment);
    }
  });

  it("recognizes normal development and automated-test modes", () => {
    expect(
      resolveAnalyticsEnvironment({
        viteMode: "development",
        isDevelopment: true,
      }),
    ).toBe("development");

    expect(
      resolveAnalyticsEnvironment({
        viteMode: "test",
        isDevelopment: false,
      }),
    ).toBe("test");
  });

  it("forces automated test mode even when pilot configuration is present", () => {
    expect(
      resolveAnalyticsEnvironment({
        configuredEnvironment: "pilot",
        viteMode: "test",
        isDevelopment: false,
      }),
    ).toBe("test");
  });

  it("fails an unconfigured production build closed to preview", () => {
    expect(
      resolveAnalyticsEnvironment({
        viteMode: "production",
        isDevelopment: false,
      }),
    ).toBe("preview");

    expect(
      resolveAnalyticsEnvironment({
        configuredEnvironment: "production",
        viteMode: "production",
        isDevelopment: false,
      }),
    ).toBe("preview");
  });

  it("classifies only an unmarked pilot session as participant traffic", () => {
    const storage = new MemorySessionStorage();

    expect(
      getAnalyticsRuntimeClassification(
        {
          configuredEnvironment: "pilot",
          viteMode: "production",
          isDevelopment: false,
        },
        storage,
      ),
    ).toEqual({
      analyticsEnvironment: "pilot",
      trafficClass: "participant",
    });

    storage.setItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY, "1");

    expect(
      getAnalyticsRuntimeClassification(
        {
          configuredEnvironment: "pilot",
          viteMode: "production",
          isDevelopment: false,
        },
        storage,
      ),
    ).toEqual({
      analyticsEnvironment: "pilot",
      trafficClass: "internal",
    });

    for (const analyticsEnvironment of [
      "development",
      "test",
      "preview",
    ] as const) {
      expect(
        getAnalyticsRuntimeClassification(
          {
            configuredEnvironment: analyticsEnvironment,
            viteMode: "production",
            isDevelopment: false,
          },
          new MemorySessionStorage(),
        ).trafficClass,
      ).toBe("internal");
    }
  });

  it("strips an internal URL marker without writing analytics storage", () => {
    const storage = new MemorySessionStorage();
    let replacedUrl = "";

    const directive = prepareAnalyticsInternalQueryMarker({
      href: "https://picktonight.example/choose?foo=bar&picktonight_internal=1#privacy",
      replaceUrl(relativeUrl) {
        replacedUrl = relativeUrl;
      },
    });

    expect(directive).toBe("set");
    expect(readAnalyticsInternalSessionMarker(storage)).toBe(false);
    expect(replacedUrl).toBe("/choose?foo=bar#privacy");
    expect(replacedUrl).not.toContain("picktonight_internal");
  });

  it("keeps the prepared marker out of sessionStorage until analytics initialization", () => {
    window.history.replaceState({}, "", "/?picktonight_internal=1");

    prepareAnalyticsRuntime();

    expect(window.location.search).toBe("");
    expect(
      window.sessionStorage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY),
    ).toBeNull();

    initializeAnalyticsRuntime();

    expect(
      window.sessionStorage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY),
    ).toBe("1");
  });

  it("removes the session marker through the analytics reset boundary", () => {
    window.sessionStorage.setItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY, "1");

    expect(readAnalyticsInternalSessionMarker(window.sessionStorage)).toBe(
      true,
    );

    expect(resetAnalyticsRuntimeSessionMarker()).toBe(true);

    expect(
      window.sessionStorage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY),
    ).toBeNull();
  });

  it("supports a deliberate marker-clear directive after consent", () => {
    window.sessionStorage.setItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY, "1");

    window.history.replaceState({}, "", "/?picktonight_internal=0");

    prepareAnalyticsRuntime();

    // URL preparation alone must not mutate analytics storage.
    expect(window.location.search).toBe("");
    expect(
      window.sessionStorage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY),
    ).toBe("1");

    initializeAnalyticsRuntime();

    expect(
      window.sessionStorage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY),
    ).toBeNull();
  });
});
