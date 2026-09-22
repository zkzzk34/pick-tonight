import posthog, { type PostHogConfig } from "posthog-js";

import {
  isPickTonightAnalyticsEventName,
  type AnalyticsEventProperties,
  type PickTonightAnalyticsEventName,
} from "./analytics-events";
import type { AnalyticsIdentifiers } from "./analytics-identity-storage";
import { filterPickTonightAnalyticsBrowserProperties } from "./analytics-property-policy";
import {
  getAnalyticsRuntimeClassification,
  type AnalyticsRuntimeClassification,
} from "./analytics-runtime";

export interface AnalyticsProviderEnvironment {
  readonly runtime: AnalyticsRuntimeClassification;
  readonly projectToken?: string;
  readonly apiHost?: string;
}

export interface AnalyticsPostHogConfiguration {
  readonly projectToken: string;
  readonly apiHost: string;
}

export type AnalyticsActivationStatus =
  "active" | "disabled-test" | "not-configured" | "failed";

export interface AnalyticsClient {
  captureEvent(
    eventName: PickTonightAnalyticsEventName,
    properties: Record<string, unknown>,
  ): void;
  disableCapture(): void;
}

export type AnalyticsClientFactory = (
  projectToken: string,
  config: Partial<PostHogConfig>,
  instanceName: string,
) => AnalyticsClient;

interface ActivationOptions {
  readonly environment?: AnalyticsProviderEnvironment;
  readonly createClient?: AnalyticsClientFactory;
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

let activeClient: AnalyticsClient | null = null;
let activeIdentityKey: string | null = null;
let activeRuntime: AnalyticsRuntimeClassification | null = null;
let instanceCounter = 0;

function readAnalyticsProviderEnvironment(): AnalyticsProviderEnvironment {
  return {
    runtime: getAnalyticsRuntimeClassification(),

    // Issue #38 uses one PostHog project because the current account supports
    // one project. The legacy DEV-named variables remain for local-config
    // compatibility; environment/traffic event properties provide partitioning.
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

export function resolveAnalyticsPostHogConfiguration(
  environment: AnalyticsProviderEnvironment,
): AnalyticsPostHogConfiguration | null {
  if (environment.runtime.analyticsEnvironment === "test") {
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

export function buildAnalyticsPostHogConfig(
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

    // Automatic product collection remains outside the reviewed taxonomy.
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

    opt_out_capturing_by_default: false,

    // Defense in depth: only the reviewed PickTonight event vocabulary and
    // exact event-property allowlist may cross the provider boundary.
    before_send: (event) => {
      if (
        !event ||
        typeof event.event !== "string" ||
        !isPickTonightAnalyticsEventName(event.event)
      ) {
        return null;
      }

      const properties = filterPickTonightAnalyticsBrowserProperties(
        event.event,
        event.properties,
      );

      if (!properties) {
        return null;
      }

      return {
        ...event,
        properties,
      };
    },

    // PickTonight does not intentionally add IP data as an event property.
    // Project-level IP-discard configuration remains required operationally.
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

const defaultClientFactory: AnalyticsClientFactory = (
  projectToken,
  config,
  instanceName,
) => {
  const client = posthog.init(projectToken, config, instanceName);

  return {
    captureEvent(eventName, properties) {
      client.capture(eventName, properties, {
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
  activeRuntime = null;

  if (!client) {
    return;
  }

  try {
    client.disableCapture();
  } catch {
    // Analytics are optional. Provider teardown must never break the product.
  }
}

export function activateAnalytics(
  identifiers: AnalyticsIdentifiers,
  options: ActivationOptions = {},
): AnalyticsActivationStatus {
  const environment = options.environment ?? readAnalyticsProviderEnvironment();

  if (environment.runtime.analyticsEnvironment === "test") {
    disableActiveClient();
    return "disabled-test";
  }

  const configuration = resolveAnalyticsPostHogConfiguration(environment);

  if (!configuration) {
    disableActiveClient();
    return "not-configured";
  }

  const identityKey = [
    identifiers.browserId,
    identifiers.sessionId,
    environment.runtime.analyticsEnvironment,
    environment.runtime.trafficClass,
  ].join(":");

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

  let client: AnalyticsClient | null = null;

  try {
    instanceCounter += 1;

    client = createClient(
      configuration.projectToken,
      buildAnalyticsPostHogConfig(configuration.apiHost, identifiers.browserId),
      `picktonight_analytics_${instanceCounter}`,
    );

    activeClient = client;
    activeIdentityKey = identityKey;
    activeRuntime = environment.runtime;

    return "active";
  } catch {
    try {
      client?.disableCapture();
    } catch {
      // Optional analytics failure must remain isolated from product behavior.
    }

    activeClient = null;
    activeIdentityKey = null;
    activeRuntime = null;

    warn(
      "PickTonight analytics could not start. Core product features remain available.",
    );

    return "failed";
  }
}

export function captureAnalyticsEvent<
  TEventName extends PickTonightAnalyticsEventName,
>(
  eventName: TEventName,
  properties: AnalyticsEventProperties<TEventName>,
): boolean {
  const client = activeClient;
  const runtime = activeRuntime;

  if (!client || !runtime) {
    return false;
  }

  // An active provider can send only events classified for exactly the
  // environment and traffic class used when that provider was activated.
  if (
    properties.analytics_environment !== runtime.analyticsEnvironment ||
    properties.traffic_class !== runtime.trafficClass
  ) {
    return false;
  }

  try {
    client.captureEvent(
      eventName,
      properties as unknown as Record<string, unknown>,
    );
    return true;
  } catch {
    // Analytics are optional. Capture failure must never break core behavior.
    return false;
  }
}

export function deactivateAnalytics(): void {
  disableActiveClient();
}

export function resetAnalyticsProviderForTests(): void {
  disableActiveClient();
  instanceCounter = 0;
}
