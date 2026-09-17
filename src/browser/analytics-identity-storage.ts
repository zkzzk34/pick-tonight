export const ANALYTICS_IDENTITY_STORAGE_KEY =
  "picktonight.analytics-identity" as const;

export const ANALYTICS_SESSION_STORAGE_KEY =
  "picktonight.analytics-session" as const;

export const ANALYTICS_IDENTITY_STORAGE_VERSION = 1 as const;

export interface AnalyticsIdentifiers {
  readonly browserId: string;
  readonly sessionId: string;
}

interface AnalyticsIdentifierRecord {
  readonly version: typeof ANALYTICS_IDENTITY_STORAGE_VERSION;
  readonly id: string;
}

type IdentifierInspection =
  | { readonly kind: "missing" }
  | { readonly kind: "valid"; readonly id: string }
  | { readonly kind: "invalid" }
  | { readonly kind: "future-version" }
  | { readonly kind: "unavailable" };

interface EnsuredIdentifier {
  readonly id: string;
  readonly created: boolean;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function inspectIdentifier(
  storage: Storage | null,
  key: string,
): IdentifierInspection {
  if (!storage) {
    return { kind: "unavailable" };
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(key);
  } catch {
    return { kind: "unavailable" };
  }

  if (rawValue === null) {
    return { kind: "missing" };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { kind: "invalid" };
    }

    const candidate = parsed as Record<string, unknown>;

    if (
      typeof candidate.version === "number" &&
      candidate.version > ANALYTICS_IDENTITY_STORAGE_VERSION
    ) {
      return { kind: "future-version" };
    }

    if (
      candidate.version !== ANALYTICS_IDENTITY_STORAGE_VERSION ||
      !isUuidV4(candidate.id)
    ) {
      return { kind: "invalid" };
    }

    return {
      kind: "valid",
      id: candidate.id,
    };
  } catch {
    return { kind: "invalid" };
  }
}

function writeIdentifier(storage: Storage, key: string, id: string): boolean {
  const record: AnalyticsIdentifierRecord = {
    version: ANALYTICS_IDENTITY_STORAGE_VERSION,
    id,
  };

  try {
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function removeIdentifier(storage: Storage | null, key: string): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function ensureIdentifier(
  storage: Storage | null,
  key: string,
  generateId: () => string | null,
): EnsuredIdentifier | null {
  const inspection = inspectIdentifier(storage, key);

  if (inspection.kind === "valid") {
    return {
      id: inspection.id,
      created: false,
    };
  }

  if (
    inspection.kind === "unavailable" ||
    inspection.kind === "future-version" ||
    !storage
  ) {
    return null;
  }

  const id = generateId();

  if (!isUuidV4(id)) {
    return null;
  }

  if (!writeIdentifier(storage, key, id)) {
    return null;
  }

  return {
    id,
    created: true,
  };
}

function formatUuidV4(bytes: Uint8Array): string {
  const hexadecimal = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

export function generateAnalyticsId(): string | null {
  try {
    const cryptoApi = globalThis.crypto;

    if (!cryptoApi) {
      return null;
    }

    if (typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }

    if (typeof cryptoApi.getRandomValues !== "function") {
      return null;
    }

    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return formatUuidV4(bytes);
  } catch {
    return null;
  }
}

export function getAnalyticsIdentityStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAnalyticsSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readAnalyticsIdentifiers(
  browserStorage: Storage | null,
  sessionStorage: Storage | null,
): AnalyticsIdentifiers | null {
  const browserIdentifier = inspectIdentifier(
    browserStorage,
    ANALYTICS_IDENTITY_STORAGE_KEY,
  );
  const sessionIdentifier = inspectIdentifier(
    sessionStorage,
    ANALYTICS_SESSION_STORAGE_KEY,
  );

  if (
    browserIdentifier.kind !== "valid" ||
    sessionIdentifier.kind !== "valid"
  ) {
    return null;
  }

  return {
    browserId: browserIdentifier.id,
    sessionId: sessionIdentifier.id,
  };
}

export function initializeAnalyticsIdentifiers(
  browserStorage: Storage | null,
  sessionStorage: Storage | null,
  generateId: () => string | null = generateAnalyticsId,
): AnalyticsIdentifiers | null {
  const browserIdentifier = ensureIdentifier(
    browserStorage,
    ANALYTICS_IDENTITY_STORAGE_KEY,
    generateId,
  );

  if (!browserIdentifier) {
    return null;
  }

  const sessionIdentifier = ensureIdentifier(
    sessionStorage,
    ANALYTICS_SESSION_STORAGE_KEY,
    generateId,
  );

  if (!sessionIdentifier) {
    if (browserIdentifier.created) {
      removeIdentifier(browserStorage, ANALYTICS_IDENTITY_STORAGE_KEY);
    }

    return null;
  }

  return {
    browserId: browserIdentifier.id,
    sessionId: sessionIdentifier.id,
  };
}

export function resetAnalyticsIdentifiers(
  browserStorage: Storage | null,
  sessionStorage: Storage | null,
): {
  readonly browserCleared: boolean;
  readonly sessionCleared: boolean;
} {
  return {
    browserCleared: removeIdentifier(
      browserStorage,
      ANALYTICS_IDENTITY_STORAGE_KEY,
    ),
    sessionCleared: removeIdentifier(
      sessionStorage,
      ANALYTICS_SESSION_STORAGE_KEY,
    ),
  };
}
