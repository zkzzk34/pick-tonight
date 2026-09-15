import { describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  readAnalyticsConsent,
  resetAnalyticsConsent,
  writeAnalyticsConsent,
} from "./analytics-consent-storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const unavailableStorage: Storage = {
  get length(): number {
    throw new Error("Storage unavailable");
  },
  clear() {
    throw new Error("Storage unavailable");
  },
  getItem() {
    throw new Error("Storage unavailable");
  },
  key() {
    throw new Error("Storage unavailable");
  },
  removeItem() {
    throw new Error("Storage unavailable");
  },
  setItem() {
    throw new Error("Storage unavailable");
  },
};

describe("analytics consent storage", () => {
  it("stores and restores a versioned accepted choice", () => {
    const storage = new MemoryStorage();

    expect(writeAnalyticsConsent(storage, "accepted")).toBe(true);
    expect(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      '{"version":1,"choice":"accepted"}',
    );
    expect(readAnalyticsConsent(storage)).toBe("accepted");
  });

  it("stores and restores a declined choice", () => {
    const storage = new MemoryStorage();

    expect(writeAnalyticsConsent(storage, "declined")).toBe(true);
    expect(readAnalyticsConsent(storage)).toBe("declined");
  });

  it("treats missing, malformed, and unsupported records as undecided", () => {
    const storage = new MemoryStorage();

    expect(readAnalyticsConsent(storage)).toBeNull();

    storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "not-json");
    expect(readAnalyticsConsent(storage)).toBeNull();

    storage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 2, choice: "accepted" }),
    );
    expect(readAnalyticsConsent(storage)).toBeNull();

    storage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 1, choice: "maybe" }),
    );
    expect(readAnalyticsConsent(storage)).toBeNull();
  });

  it("removes only the analytics consent record when reset", () => {
    const storage = new MemoryStorage();

    storage.setItem("picktonight.other-data", "keep-me");
    writeAnalyticsConsent(storage, "declined");

    expect(resetAnalyticsConsent(storage)).toBe(true);
    expect(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("picktonight.other-data")).toBe("keep-me");
  });

  it("fails safely when browser storage is unavailable", () => {
    expect(readAnalyticsConsent(unavailableStorage)).toBeNull();
    expect(writeAnalyticsConsent(unavailableStorage, "accepted")).toBe(false);
    expect(resetAnalyticsConsent(unavailableStorage)).toBe(false);

    expect(readAnalyticsConsent(null)).toBeNull();
    expect(writeAnalyticsConsent(null, "declined")).toBe(false);
    expect(resetAnalyticsConsent(null)).toBe(false);
  });
});
