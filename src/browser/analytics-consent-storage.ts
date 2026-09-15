export const ANALYTICS_CONSENT_STORAGE_KEY =
  "picktonight.analytics-consent" as const;

export type AnalyticsConsentChoice = "accepted" | "declined";

interface AnalyticsConsentRecord {
  version: 1;
  choice: AnalyticsConsentChoice;
}

function isAnalyticsConsentChoice(
  value: unknown,
): value is AnalyticsConsentChoice {
  return value === "accepted" || value === "declined";
}

function parseAnalyticsConsentRecord(
  value: string,
): AnalyticsConsentChoice | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;

    if (
      candidate.version !== 1 ||
      !isAnalyticsConsentChoice(candidate.choice)
    ) {
      return null;
    }

    return candidate.choice;
  } catch {
    return null;
  }
}

export function getAnalyticsConsentStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAnalyticsConsent(
  storage: Storage | null,
): AnalyticsConsentChoice | null {
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);

    if (value === null) {
      return null;
    }

    return parseAnalyticsConsentRecord(value);
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(
  storage: Storage | null,
  choice: AnalyticsConsentChoice,
): boolean {
  if (!storage) {
    return false;
  }

  const record: AnalyticsConsentRecord = {
    version: 1,
    choice,
  };

  try {
    storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function resetAnalyticsConsent(storage: Storage | null): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
