import posthog, { type PostHogConfig } from "posthog-js";

import type { AnalyticsIdentifiers } from "./analytics-identity-storage";

export const DEVELOPMENT_ANALYTICS_VERIFICATION_EVENT =
  "picktonight_development_analytics_verified" as const;

export interface DevelopmentAnalyticsEnvironment {
  readonly isDevelopment: boolean;
  readonly projectToken?: string;
  readonly apiHost?: string;
}

export interface DevelopmentPostHogConfiguration {
  readonly projectToken: string;
  readonly apiHost: string;
}

export type DevelopmentAnalyticsActivationStatus =
  "active" | "not-development" | "not-configured" | "failed";

export interface DevelopmentAnalyticsClient {
  captureVerificationEvent(): void;
  disableCapture(): void;
}

export type DevelopmentAnalyticsClientFactory = (
  projectToken: string,
  config: Partial<PostHogConfig>,
  instanceName: string,
) => DevelopmentAnalyticsClient;

interface ActivationOptions {
  readonly environment?: DevelopmentAnalyticsEnvironment;
  readonly createClient?: DevelopmentAnalyticsClientFactory;
  readonly warn?: (message: string) => void;
}

const UNSAFE_AUTOMATIC_PROPERTIES = [
  "$current_url",
  "$pathname",
  "$referrer",
  "$referring_domain",
  "$initial_current_url",
  "$initial_referrer",
  "$initial_referring_domain",
  "$title",
  "$screen_name",
  "$search_engine",
  "$keyword",
] as const;

let activeClient: DevelopmentAnalyticsClient | null = null;
let activeIdentityKey: string | null = null;
let verificationEventCaptured = false;
let instanceCounter = 0;

function readDevelopmentAnalyticsEnvironment(): DevelopmentAnalyticsEnvironment {
  return {
    isDevelopment: import.meta.env.DEV,
    projectToken: import.meta.env.VITE_POSTHOG_DEV_PROJECT_TOKEN,
    apiHost: import.meta.env.VITE_POSTHOG_DEV_HOST,
  };
}

function normalizeProjectToken(value: string | undefined): string | null {
  const token = value?.trim();

  if (!token || token.startsWith("replace_")) {
    return null;
  }

  return token;
}

function normalizeApiHost(value: string | undefined): string | null {
  const rawHost = value?.trim();

  if (!rawHost || rawHost.startsWith("replace_")) {
    return null;
  }

  try {
    const url = new URL(rawHost);

    if (url.username || url.password || url.search || url.hash) {
      return null;
    }

    const isHttps = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (!isHttps && !isLocalHttp) {
      return null;
    }

    if (url.pathname !== "/" && url.pathname !== "") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function resolveDevelopmentPostHogConfiguration(
  environment: DevelopmentAnalyticsEnvironment,
): DevelopmentPostHogConfiguration | null {
  if (!environment.isDevelopment) {
    return null;
  }

  const projectToken = normalizeProjectToken(environment.projectToken);
  const apiHost = normalizeApiHost(environment.apiHost);

  if (!projectToken || !apiHost) {
    return null;
  }

  return {
    projectToken,
    apiHost,
  };
}

export function buildDevelopmentPostHogConfig(
  apiHost: string,
  browserId: string,
): Partial<PostHogConfig> {
  return {
    api_host: apiHost,

    bootstrap: {
      distinctID: browserId,
      isIdentifiedID: false,
    },

    // PickTonight owns the durable identity. PostHog must not establish a
    // second persistent browser identity or consent system.
    persistence: "memory",
    disable_persistence: true,
    person_profiles: "never",

    // Automatic product collection is outside Issue #32.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_performance: false,
    rageclick: false,

    disable_session_recording: true,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disable_external_dependency_loading: true,
    disable_web_experiments: true,

    // Issue #32 does not use flags, experiments, remote configuration, or
    // survey targeting. This prevents the normal /flags startup request.
    advanced_disable_flags: true,
    advanced_disable_decide: true,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    advanced_disable_toolbar_metrics: true,

    disable_product_tours: true,
    disable_conversations: true,
    opt_in_site_apps: false,

    save_campaign_params: false,
    save_referrer: false,

    mask_all_text: true,
    mask_all_element_attributes: true,

    cross_subdomain_cookie: false,
    request_batching: false,
    disable_beacon: true,

    property_denylist: [...UNSAFE_AUTOMATIC_PROPERTIES],

    // The provider is initialized only after PickTonight consent. We do not
    // call PostHog opt-in/out APIs because those APIs maintain provider-owned
    // consent persistence.
    opt_out_capturing_by_default: false,

    // Defense in depth: Issue #32 is allowed to deliver exactly one named
    // infrastructure verification event. Everything else is rejected locally.
    before_send: (event) =>
      event?.event === DEVELOPMENT_ANALYTICS_VERIFICATION_EVENT ? event : null,

    // This prevents an explicit event property containing an IP address.
    // Network-level IP handling still requires the development PostHog project
    // to be configured to discard client IP data before live verification.
    ip: false,
  };
}

function makeClientCaptureInert(client: {
  set_config(config: Partial<PostHogConfig>): void;
}): void {
  client.set_config({
    before_send: () => null,
  });
}

const defaultClientFactory: DevelopmentAnalyticsClientFactory = (
  projectToken,
  config,
  instanceName,
) => {
  const client = posthog.init(projectToken, config, instanceName);

  return {
    captureVerificationEvent() {
      client.capture(DEVELOPMENT_ANALYTICS_VERIFICATION_EVENT, undefined, {
        send_instantly: true,
      });
    },

    disableCapture() {
      makeClientCaptureInert(client);
    },
  };
};

function disableActiveClient(): void {
  const client = activeClient;

  activeClient = null;
  activeIdentityKey = null;

  if (!client) {
    return;
  }

  try {
    client.disableCapture();
  } catch {
    // Analytics are optional. Provider teardown must never break the product.
  }
}

export function activateDevelopmentAnalytics(
  identifiers: AnalyticsIdentifiers,
  options: ActivationOptions = {},
): DevelopmentAnalyticsActivationStatus {
  const environment =
    options.environment ?? readDevelopmentAnalyticsEnvironment();

  if (!environment.isDevelopment) {
    disableActiveClient();
    return "not-development";
  }

  const configuration = resolveDevelopmentPostHogConfiguration(environment);

  if (!configuration) {
    disableActiveClient();
    return "not-configured";
  }

  const identityKey = `${identifiers.browserId}:${identifiers.sessionId}`;

  if (activeClient && activeIdentityKey === identityKey) {
    return "active";
  }

  disableActiveClient();

  const createClient = options.createClient ?? defaultClientFactory;
  const warn =
    options.warn ??
    ((message: string) => {
      console.warn(message);
    });

  let client: DevelopmentAnalyticsClient | null = null;

  try {
    instanceCounter += 1;

    client = createClient(
      configuration.projectToken,
      buildDevelopmentPostHogConfig(
        configuration.apiHost,
        identifiers.browserId,
      ),
      `picktonight_development_${instanceCounter}`,
    );

    activeClient = client;
    activeIdentityKey = identityKey;

    if (!verificationEventCaptured) {
      client.captureVerificationEvent();
      verificationEventCaptured = true;
    }

    return "active";
  } catch {
    try {
      client?.disableCapture();
    } catch {
      // Optional analytics failure must remain isolated from product behavior.
    }

    activeClient = null;
    activeIdentityKey = null;

    warn(
      "PickTonight development analytics could not start. Core product features remain available.",
    );

    return "failed";
  }
}

export function deactivateDevelopmentAnalytics(): void {
  disableActiveClient();
}

export function resetDevelopmentAnalyticsForTests(): void {
  disableActiveClient();
  verificationEventCaptured = false;
  instanceCounter = 0;
}
