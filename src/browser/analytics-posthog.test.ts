import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateDevelopmentAnalytics,
  buildDevelopmentPostHogConfig,
  captureDevelopmentAnalyticsEvent,
  deactivateDevelopmentAnalytics,
  resetDevelopmentAnalyticsForTests,
  resolveDevelopmentPostHogConfiguration,
  type DevelopmentAnalyticsClient,
  type DevelopmentAnalyticsClientFactory,
} from "./analytics-posthog";
import type { AnalyticsIdentifiers } from "./analytics-identity-storage";
import { createAnalyticsBaseProperties } from "./analytics-events";

const IDENTIFIERS: AnalyticsIdentifiers = {
  browserId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
};
const CONFIGURED_ENVIRONMENT = {
  isDevelopment: true,
  projectToken: "phc_development_project_token",
  apiHost: "https://us.i.posthog.com",
} as const;

function makeClient() {
  const captureVerificationEvent = vi.fn(() => undefined);
  const captureEvent = vi.fn<DevelopmentAnalyticsClient["captureEvent"]>(
    () => undefined,
  );
  const disableCapture = vi.fn(() => undefined);

  return {
    captureVerificationEvent,
    captureEvent,
    disableCapture,
  } satisfies DevelopmentAnalyticsClient;
}

describe("development PostHog adapter", () => {
  beforeEach(() => {
    resetDevelopmentAnalyticsForTests();
  });

  it("requires development mode and both documented configuration values", () => {
    expect(
      resolveDevelopmentPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        isDevelopment: false,
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        isDevelopment: true,
        projectToken: undefined,
        apiHost: CONFIGURED_ENVIRONMENT.apiHost,
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        isDevelopment: true,
        projectToken: CONFIGURED_ENVIRONMENT.projectToken,
        apiHost: undefined,
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        isDevelopment: true,
        projectToken: "replace_with_your_posthog_development_project_token",
        apiHost: CONFIGURED_ENVIRONMENT.apiHost,
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration(CONFIGURED_ENVIRONMENT),
    ).toEqual({
      projectToken: CONFIGURED_ENVIRONMENT.projectToken,
      apiHost: CONFIGURED_ENVIRONMENT.apiHost,
    });
  });

  it("rejects unsafe or credential-bearing ingestion hosts", () => {
    expect(
      resolveDevelopmentPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        apiHost: "http://example.com",
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        apiHost: "https://user:password@example.com",
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        apiHost: "https://example.com/ingest",
      }),
    ).toBeNull();

    expect(
      resolveDevelopmentPostHogConfiguration({
        ...CONFIGURED_ENVIRONMENT,
        apiHost: "http://127.0.0.1:8000",
      }),
    ).toEqual({
      projectToken: CONFIGURED_ENVIRONMENT.projectToken,
      apiHost: "http://127.0.0.1:8000",
    });
  });

  it("builds the deliberately minimal provider configuration", () => {
    const config = buildDevelopmentPostHogConfig(
      CONFIGURED_ENVIRONMENT.apiHost,
      IDENTIFIERS.browserId,
    );

    expect(config).toMatchObject({
      api_host: CONFIGURED_ENVIRONMENT.apiHost,
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
  it("does not create a provider outside development or without configuration", () => {
    const createClient = vi.fn<DevelopmentAnalyticsClientFactory>();

    expect(
      activateDevelopmentAnalytics(IDENTIFIERS, {
        environment: {
          ...CONFIGURED_ENVIRONMENT,
          isDevelopment: false,
        },
        createClient,
      }),
    ).toBe("not-development");

    expect(
      activateDevelopmentAnalytics(IDENTIFIERS, {
        environment: {
          isDevelopment: true,
          projectToken: undefined,
          apiHost: undefined,
        },
        createClient,
      }),
    ).toBe("not-configured");

    expect(createClient).not.toHaveBeenCalled();
  });
  it("delivers reviewed product events only while the provider is active", () => {
    const client = makeClient();
    const createClient = vi.fn<DevelopmentAnalyticsClientFactory>(() => client);
    const properties = createAnalyticsBaseProperties(IDENTIFIERS.sessionId);

    expect(captureDevelopmentAnalyticsEvent("app_opened", properties)).toBe(
      false,
    );

    activateDevelopmentAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    expect(captureDevelopmentAnalyticsEvent("app_opened", properties)).toBe(
      true,
    );

    expect(client.captureEvent).toHaveBeenCalledTimes(1);
    expect(client.captureEvent).toHaveBeenCalledWith("app_opened", properties);

    deactivateDevelopmentAnalytics();

    expect(captureDevelopmentAnalyticsEvent("app_opened", properties)).toBe(
      false,
    );
    expect(client.captureEvent).toHaveBeenCalledTimes(1);
  });

  it("isolates provider capture failure from core product behavior", () => {
    const client = makeClient();

    client.captureEvent.mockImplementation(() => {
      throw new Error("capture failure");
    });

    const createClient = vi.fn<DevelopmentAnalyticsClientFactory>(() => client);

    activateDevelopmentAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    expect(
      captureDevelopmentAnalyticsEvent(
        "app_opened",
        createAnalyticsBaseProperties(IDENTIFIERS.sessionId),
      ),
    ).toBe(false);
  });

  it("does not initialize or capture again for duplicate React synchronization", () => {
    const client = makeClient();

    const createClient = vi.fn<DevelopmentAnalyticsClientFactory>(() => client);

    activateDevelopmentAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    activateDevelopmentAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.captureVerificationEvent).toHaveBeenCalledTimes(1);
  });

  it("makes the active client capture-inert when analytics is withdrawn", () => {
    const client = makeClient();

    const createClient = vi.fn<DevelopmentAnalyticsClientFactory>(() => client);

    activateDevelopmentAnalytics(IDENTIFIERS, {
      environment: CONFIGURED_ENVIRONMENT,
      createClient,
    });

    deactivateDevelopmentAnalytics();

    expect(client.disableCapture).toHaveBeenCalledTimes(1);
  });
  it("fails safely when provider startup fails", () => {
    const warn = vi.fn();

    const createClient: DevelopmentAnalyticsClientFactory = () => {
      throw new Error("provider startup failure");
    };

    expect(
      activateDevelopmentAnalytics(IDENTIFIERS, {
        environment: CONFIGURED_ENVIRONMENT,
        createClient,
        warn,
      }),
    ).toBe("failed");

    expect(warn).toHaveBeenCalledWith(
      "PickTonight development analytics could not start. Core product features remain available.",
    );
  });
});
