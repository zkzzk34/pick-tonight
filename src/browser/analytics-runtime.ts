export const ANALYTICS_ENVIRONMENT_CODES = [
  "development",
  "test",
  "preview",
  "pilot",
] as const;

export type AnalyticsEnvironmentCode =
  (typeof ANALYTICS_ENVIRONMENT_CODES)[number];

export const ANALYTICS_TRAFFIC_CLASSES = ["internal", "participant"] as const;

export type AnalyticsTrafficClass = (typeof ANALYTICS_TRAFFIC_CLASSES)[number];

export interface AnalyticsRuntimeClassification {
  readonly analyticsEnvironment: AnalyticsEnvironmentCode;
  readonly trafficClass: AnalyticsTrafficClass;
}

export interface AnalyticsRuntimeEnvironmentSource {
  readonly configuredEnvironment?: string;
  readonly viteMode?: string;
  readonly isDevelopment?: boolean;
}

export interface AnalyticsSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ANALYTICS_INTERNAL_QUERY_PARAM = "picktonight_internal";

export const ANALYTICS_INTERNAL_SESSION_STORAGE_KEY =
  "picktonight.analytics.internal.v1";

type PendingInternalMarker = "set" | "clear" | null;

let pendingInternalMarker: PendingInternalMarker = null;

function isAnalyticsEnvironmentCode(
  value: unknown,
): value is AnalyticsEnvironmentCode {
  return (
    typeof value === "string" &&
    (ANALYTICS_ENVIRONMENT_CODES as readonly string[]).includes(value)
  );
}

function readRuntimeEnvironmentSource(): AnalyticsRuntimeEnvironmentSource {
  return {
    configuredEnvironment: import.meta.env
      .VITE_PICKTONIGHT_ANALYTICS_ENVIRONMENT,
    viteMode: import.meta.env.MODE,
    isDevelopment: import.meta.env.DEV,
  };
}

function getBrowserSessionStorage(): AnalyticsSessionStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function resolveAnalyticsEnvironment(
  source: AnalyticsRuntimeEnvironmentSource,
): AnalyticsEnvironmentCode {
  // Automated-test execution has highest precedence. Accidentally inherited
  // pilot variables must never turn a test process into pilot traffic.
  if (source.viteMode === "test") {
    return "test";
  }

  const configured = source.configuredEnvironment?.trim();

  if (isAnalyticsEnvironmentCode(configured)) {
    return configured;
  }

  if (source.viteMode === "development" || source.isDevelopment === true) {
    return "development";
  }

  // Fail closed. A generic production build is never assumed to represent
  // real pilot participants.
  return "preview";
}

export function readAnalyticsInternalSessionMarker(
  storage: AnalyticsSessionStorage | null,
): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Parses and strips the operator-only internal-session URL marker.
 *
 * This function deliberately does not write browser storage. Before analytics
 * consent, the requested classification remains transient application state.
 */
export function prepareAnalyticsInternalQueryMarker({
  href,
  replaceUrl,
}: {
  readonly href: string;
  readonly replaceUrl: (relativeUrl: string) => void;
}): PendingInternalMarker {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (!url.searchParams.has(ANALYTICS_INTERNAL_QUERY_PARAM)) {
    return null;
  }

  const marker = url.searchParams.get(ANALYTICS_INTERNAL_QUERY_PARAM);

  const directive: PendingInternalMarker =
    marker === "1" ? "set" : marker === "0" ? "clear" : null;

  // Never retain the operator marker in a visible/shareable URL.
  url.searchParams.delete(ANALYTICS_INTERNAL_QUERY_PARAM);

  replaceUrl(`${url.pathname}${url.search}${url.hash}`);

  return directive;
}

function applyPendingInternalMarker(
  storage: AnalyticsSessionStorage | null,
): void {
  const directive = pendingInternalMarker;

  if (directive === null) {
    return;
  }

  try {
    if (directive === "set") {
      storage?.setItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY, "1");
    } else {
      storage?.removeItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY);
    }
  } catch {
    // Optional analytics classification must never break core behavior.
  }

  pendingInternalMarker = null;
}

export function getAnalyticsRuntimeClassification(
  source: AnalyticsRuntimeEnvironmentSource = readRuntimeEnvironmentSource(),
  storage: AnalyticsSessionStorage | null = getBrowserSessionStorage(),
): AnalyticsRuntimeClassification {
  const analyticsEnvironment = resolveAnalyticsEnvironment(source);

  const trafficClass =
    analyticsEnvironment === "pilot" &&
    !readAnalyticsInternalSessionMarker(storage)
      ? "participant"
      : "internal";

  return {
    analyticsEnvironment,
    trafficClass,
  };
}

/**
 * Runs during application initialization.
 *
 * It may remove the operator marker from the URL, but it does not establish
 * analytics browser storage before affirmative analytics consent.
 */
export function prepareAnalyticsRuntime(): void {
  if (typeof window === "undefined") {
    return;
  }

  const directive = prepareAnalyticsInternalQueryMarker({
    href: window.location.href,
    replaceUrl(relativeUrl) {
      try {
        window.history.replaceState(window.history.state, "", relativeUrl);
      } catch {
        // URL cleanup is best-effort and must not break the product.
      }
    },
  });

  if (directive !== null) {
    pendingInternalMarker = directive;
  }
}

/**
 * Runs only after analytics consent and identifiers are ready.
 */
export function initializeAnalyticsRuntime(): AnalyticsRuntimeClassification {
  const storage = getBrowserSessionStorage();

  applyPendingInternalMarker(storage);

  return getAnalyticsRuntimeClassification(undefined, storage);
}

export function resetAnalyticsRuntimeSessionMarker(): boolean {
  pendingInternalMarker = null;

  if (typeof window === "undefined") {
    return true;
  }

  const storage = getBrowserSessionStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(ANALYTICS_INTERNAL_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function resetAnalyticsRuntimeForTests(): void {
  pendingInternalMarker = null;
}
