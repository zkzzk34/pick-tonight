import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAnalyticsBaseProperties } from "./analytics-events";
import type { AnalyticsIdentifiers } from "./analytics-identity-storage";
import {
  activateAnalytics,
  buildAnalyticsPostHogConfig,
  captureAnalyticsEvent,
  deactivateAnalytics,
  resetAnalyticsProviderForTests,
  resolveAnalyticsPostHogConfiguration,
  type AnalyticsClient,
  type AnalyticsClientFactory,
  type AnalyticsProviderEnvironment,
} from "./analytics-posthog";

const IDENTIFIERS: AnalyticsIdentifiers = {
  browserId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
};

const DEVELOPMENT_RUNTIME = {
  analyticsEnvironment: "development",
  trafficClass: "internal",
} as const;

const TEST_RUNTIME = {
  analyticsEnvironment: "test",
  trafficClass: "internal",
} as const;

const PREVIEW_RUNTIME = {
  analyticsEnvironment: "preview",
  trafficClass: "internal",
} as const;

const PILOT_PARTICIPANT_RUNTIME = {
  analyticsEnvironment: "pilot",
  trafficClass: "participant",
} as const;

const PILOT_INTERNAL_RUNTIME = {
  analyticsEnvironment: "pilot",
  trafficClass: "internal",
} as const;

const CONFIGURED_ENVIRONMENT: AnalyticsProviderEnvironment = {
  runtime: DEVELOPMENT_RUNTIME,
  projectToken: "phc_shared_project_token",
  apiHost: "https://us.i.posthog.com",
};

function makeClient() {
  const captureEvent = vi.fn<AnalyticsClient["captureEvent"]>(() => undefined);
  const disableCapture = vi.fn(() => undefined);

  return {
    captureEvent,
    disableCapture,
  } satisfies AnalyticsClient;
}

describe("Issue #38 PostHog traffic boundary", () => {
  beforeEach(() => {
    resetAnalyticsProviderForTests();
  });

  it("uses one configured PostHog project across development, preview, and pilot", () => {
    expect(
      resolveAnalyticsPostHogConfiguration(CONFIGURED_ENVIRONMENT),
    ).toEqual({
      projectToken: "phc_shared_project_token",
      apiHost: "https://us.i.posthog.com",
    });

    expect(
      resolveAnalyticsPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        runtime: PREVIEW_RUNTIME,
      }),
    ).toEqual({
      projectToken: "phc_shared_project_token",
      apiHost: "https://us.i.posthog.com",
    });

    expect(
      resolveAnalyticsPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        runtime: PILOT_PARTICIPANT_RUNTIME,
      }),
    ).toEqual({
      projectToken: "phc_shared_project_token",
      apiHost: "https://us.i.posthog.com",
    });
  });

  it("prevents automated-test runtime from resolving a provider", () => {
    expect(
      resolveAnalyticsPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        runtime: TEST_RUNTIME,
      }),
    ).toBeNull();
  });

  it("requires the shared project configuration for deliverable environments", () => {
    expect(
      resolveAnalyticsPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        runtime: PILOT_PARTICIPANT_RUNTIME,
        projectToken: undefined,
        apiHost: undefined,
      }),
    ).toBeNull();
  });

  it("rejects unsafe or credential-bearing ingestion hosts", () => {
    for (const apiHost of [
      "http://example.com",
      "https://user:password@example.com",
      "https://example.com/ingest",
    ]) {
      expect(
        resolveAnalyticsPostHogConfiguration({
          ...CONFIGURED_ENVIRONMENT,
          apiHost,
        }),
      ).toBeNull();
    }

    expect(
      resolveAnalyticsPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        apiHost: "http://127.0.0.1:8000",
      }),
    ).toEqual({
      projectToken: "phc_shared_project_token",
      apiHost: "http://127.0.0.1:8000",
    });
  });

  it("builds the deliberately minimal provider configuration", () => {
    const config = buildAnalyticsPostHogConfig(
      "https://us.i.posthog.com",
      IDENTIFIERS.browserId,
    );

    expect(config).toMatchObject({
      api_host: "https://us.i.posthog.com",
      bootstrap: {
        distinctID: IDENTIFIERS.browserId,
        isIdentifiedID: false,
      },
      persistence: "memory",
      disable_persistence: true,
      person_profiles: "never",
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
      save_campaign_params: false,
      save_referrer: false,
      cross_subdomain_cookie: false,
      request_batching: false,
      disable_beacon: true,
      opt_out_capturing_by_default: false,
      ip: false,
    });

    expect(config.bootstrap).not.toHaveProperty("sessionID");
  });

  it("hard-disables the actual Vitest runtime before provider routing", () => {
    const createClient = vi.fn<AnalyticsClientFactory>();

    expect(
      activateAnalytics(IDENTIFIERS, {
        createClient,
      }),
    ).toBe("disabled-test");

    expect(createClient).not.toHaveBeenCalled();
  });

  it("hard-disables provider startup for automated tests", () => {
    const createClient = vi.fn<AnalyticsClientFactory>();

    expect(
      activateAnalytics(IDENTIFIERS, {
        environment: {
          ...CONFIGURED_ENVIRONMENT,
          runtime: TEST_RUNTIME,
        },
        createClient,
      }),
    ).toBe("disabled-test");

    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not activate pilot analytics while the separate pilot project is unconfigured", () => {
    const createClient = vi.fn<AnalyticsClientFactory>();

    expect(
      activateAnalytics(IDENTIFIERS, {
        environment: {
          ...CONFIGURED_ENVIRONMENT,
          runtime: PILOT_PARTICIPANT_RUNTIME,
          projectToken: undefined,
          apiHost: undefined,
        },
        createClient,
      }),
    ).toBe("not-configured");

    expect(createClient).not.toHaveBeenCalled();
  });

  it("delivers only events matching the active runtime classification", () => {
    const client = makeClient();
    const createClient = vi.fn<AnalyticsClientFactory>(() => client);

    const developmentProperties = createAnalyticsBaseProperties(
      IDENTIFIERS.sessionId,
      DEVELOPMENT_RUNTIME,
    );

    const pilotProperties = createAnalyticsBaseProperties(
      IDENTIFIERS.sessionId,
      PILOT_PARTICIPANT_RUNTIME,
    );

    expect(captureAnalyticsEvent("app_opened", developmentProperties)).toBe(
      false,
    );

    expect(
      activateAnalytics(IDENTIFIERS, {
        environment: CONFIGURED_ENVIRONMENT,
        createClient,
      }),
    ).toBe("active");

    expect(captureAnalyticsEvent("app_opened", developmentProperties)).toBe(
      true,
    );

    expect(captureAnalyticsEvent("app_opened", pilotProperties)).toBe(false);

    expect(client.captureEvent).toHaveBeenCalledTimes(1);
    expect(client.captureEvent).toHaveBeenCalledWith(
      "app_opened",
      developmentProperties,
    );

    deactivateAnalytics();

    expect(captureAnalyticsEvent("app_opened", developmentProperties)).toBe(
      false,
    );
  });

  it("allows controlled pilot/internal verification without relabeling it participant", () => {
    const client = makeClient();
    const createClient = vi.fn<AnalyticsClientFactory>(() => client);

    expect(
      activateAnalytics(IDENTIFIERS, {
        environment: {
          ...CONFIGURED_ENVIRONMENT,
          runtime: PILOT_INTERNAL_RUNTIME,
        },
        createClient,
      }),
    ).toBe("active");

    expect(createClient).toHaveBeenCalledWith(
      "phc_shared_project_token",
      expect.any(Object),
      "picktonight_analytics_1",
    );

    const internalProperties = createAnalyticsBaseProperties(
      IDENTIFIERS.sessionId,
      PILOT_INTERNAL_RUNTIME,
    );

    const participantProperties = createAnalyticsBaseProperties(
      IDENTIFIERS.sessionId,
      PILOT_PARTICIPANT_RUNTIME,
    );

    expect(captureAnalyticsEvent("app_opened", internalProperties)).toBe(true);

    expect(captureAnalyticsEvent("app_opened", participantProperties)).toBe(
      false,
    );
  });

  it("does not initialize twice for duplicate React synchronization", () => {
    const client = makeClient();
    const createClient = vi.fn<AnalyticsClientFactory>(() => client);

    activateAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    activateAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("isolates provider capture failure from core product behavior", () => {
    const client = makeClient();

    client.captureEvent.mockImplementation(() => {
      throw new Error("capture failure");
    });

    const createClient = vi.fn<AnalyticsClientFactory>(() => client);

    activateAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    expect(
      captureAnalyticsEvent(
        "app_opened",
        createAnalyticsBaseProperties(
          IDENTIFIERS.sessionId,
          DEVELOPMENT_RUNTIME,
        ),
      ),
    ).toBe(false);
  });

  it("makes the active client capture-inert when analytics is withdrawn", () => {
    const client = makeClient();
    const createClient = vi.fn<AnalyticsClientFactory>(() => client);

    activateAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    deactivateAnalytics();

    expect(client.disableCapture).toHaveBeenCalledTimes(1);
  });

  it("fails safely when provider startup fails", () => {
    const warn = vi.fn();

    const createClient: AnalyticsClientFactory = () => {
      throw new Error("provider startup failure");
    };

    expect(
      activateAnalytics(IDENTIFIERS, {
        environment: CONFIGURED_ENVIRONMENT,
        createClient,
        warn,
      }),
    ).toBe("failed");

    expect(warn).toHaveBeenCalledWith(
      "PickTonight analytics could not start. Core product features remain available.",
    );
  });
});
