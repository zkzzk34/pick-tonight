import { describe, expect, it } from "vitest";

import {
  ANALYTICS_IDENTITY_STORAGE_KEY,
  ANALYTICS_SESSION_STORAGE_KEY,
  initializeAnalyticsIdentifiers,
  readAnalyticsIdentifiers,
  resetAnalyticsIdentifiers,
} from "./analytics-identity-storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const unavailableStorage: Storage = {
  get length(): number {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },

  clear(): void {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },

  getItem(): string | null {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },

  key(): string | null {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },

  removeItem(): void {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },

  setItem(): void {
    throw new DOMException("Storage unavailable.", "SecurityError");
  },
};

const BROWSER_ID = "11111111-1111-4111-8111-111111111111";
const FIRST_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_SESSION_ID = "33333333-3333-4333-8333-333333333333";

function idGenerator(...ids: string[]): () => string | null {
  const remaining = [...ids];

  return () => remaining.shift() ?? null;
}

describe("analytics identity storage", () => {
  it("creates versioned browser and page-session identifiers", () => {
    const browserStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    const identifiers = initializeAnalyticsIdentifiers(
      browserStorage,
      sessionStorage,
      idGenerator(BROWSER_ID, FIRST_SESSION_ID),
    );

    expect(identifiers).toEqual({
      browserId: BROWSER_ID,
      sessionId: FIRST_SESSION_ID,
    });

    expect(browserStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY)).toBe(
      `{"version":1,"id":"${BROWSER_ID}"}`,
    );
    expect(sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY)).toBe(
      `{"version":1,"id":"${FIRST_SESSION_ID}"}`,
    );

    expect(readAnalyticsIdentifiers(browserStorage, sessionStorage)).toEqual(
      identifiers,
    );
  });

  it("reuses both identifiers within the same page session", () => {
    const browserStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    const first = initializeAnalyticsIdentifiers(
      browserStorage,
      sessionStorage,
      idGenerator(BROWSER_ID, FIRST_SESSION_ID),
    );

    const second = initializeAnalyticsIdentifiers(
      browserStorage,
      sessionStorage,
      () => {
        throw new Error("Existing identifiers should be reused.");
      },
    );

    expect(second).toEqual(first);
  });

  it("keeps the browser identifier and creates a new identifier for a new page session", () => {
    const browserStorage = new MemoryStorage();
    const firstSessionStorage = new MemoryStorage();

    const first = initializeAnalyticsIdentifiers(
      browserStorage,
      firstSessionStorage,
      idGenerator(BROWSER_ID, FIRST_SESSION_ID),
    );

    const secondSessionStorage = new MemoryStorage();
    const second = initializeAnalyticsIdentifiers(
      browserStorage,
      secondSessionStorage,
      idGenerator(SECOND_SESSION_ID),
    );

    expect(first).toEqual({
      browserId: BROWSER_ID,
      sessionId: FIRST_SESSION_ID,
    });

    expect(second).toEqual({
      browserId: BROWSER_ID,
      sessionId: SECOND_SESSION_ID,
    });
  });

  it("repairs malformed current data only with reviewed random identifiers", () => {
    const browserStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    browserStorage.setItem(ANALYTICS_IDENTITY_STORAGE_KEY, "not-json");
    sessionStorage.setItem(
      ANALYTICS_SESSION_STORAGE_KEY,
      '{"version":1,"id":"not-a-uuid"}',
    );

    expect(
      initializeAnalyticsIdentifiers(
        browserStorage,
        sessionStorage,
        idGenerator(BROWSER_ID, FIRST_SESSION_ID),
      ),
    ).toEqual({
      browserId: BROWSER_ID,
      sessionId: FIRST_SESSION_ID,
    });
  });

  it("does not overwrite an unknown future identity schema", () => {
    const browserStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    const futureRecord = `{"version":2,"id":"${BROWSER_ID}"}`;
    browserStorage.setItem(ANALYTICS_IDENTITY_STORAGE_KEY, futureRecord);

    expect(
      initializeAnalyticsIdentifiers(
        browserStorage,
        sessionStorage,
        idGenerator(FIRST_SESSION_ID),
      ),
    ).toBeNull();

    expect(browserStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY)).toBe(
      futureRecord,
    );
    expect(sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("fails closed when either required storage area is unavailable", () => {
    const browserStorage = new MemoryStorage();

    expect(
      initializeAnalyticsIdentifiers(
        unavailableStorage,
        new MemoryStorage(),
        idGenerator(BROWSER_ID, FIRST_SESSION_ID),
      ),
    ).toBeNull();

    expect(
      initializeAnalyticsIdentifiers(
        browserStorage,
        unavailableStorage,
        idGenerator(BROWSER_ID, FIRST_SESSION_ID),
      ),
    ).toBeNull();

    expect(browserStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY)).toBeNull();
  });

  it("fails closed when a secure valid identifier cannot be generated", () => {
    expect(
      initializeAnalyticsIdentifiers(
        new MemoryStorage(),
        new MemoryStorage(),
        () => null,
      ),
    ).toBeNull();

    expect(
      initializeAnalyticsIdentifiers(
        new MemoryStorage(),
        new MemoryStorage(),
        () => "predictable-id",
      ),
    ).toBeNull();
  });

  it("removes only PickTonight analytics identifier keys", () => {
    const browserStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    browserStorage.setItem("unrelated.site-data", "keep-me");
    sessionStorage.setItem("unrelated.session-data", "keep-me");

    expect(
      initializeAnalyticsIdentifiers(
        browserStorage,
        sessionStorage,
        idGenerator(BROWSER_ID, FIRST_SESSION_ID),
      ),
    ).not.toBeNull();

    expect(resetAnalyticsIdentifiers(browserStorage, sessionStorage)).toEqual({
      browserCleared: true,
      sessionCleared: true,
    });

    expect(browserStorage.getItem(ANALYTICS_IDENTITY_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY)).toBeNull();

    expect(browserStorage.getItem("unrelated.site-data")).toBe("keep-me");
    expect(sessionStorage.getItem("unrelated.session-data")).toBe("keep-me");
  });

  it("reports reset failure honestly when storage cannot be updated", () => {
    expect(
      resetAnalyticsIdentifiers(unavailableStorage, unavailableStorage),
    ).toEqual({
      browserCleared: false,
      sessionCleared: false,
    });

    expect(resetAnalyticsIdentifiers(null, null)).toEqual({
      browserCleared: false,
      sessionCleared: false,
    });
  });
});
