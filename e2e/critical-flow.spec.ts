import {
  expect,
  test,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";

import { RECOMMENDATION_SUCCESS_FIXTURE } from "./fixtures/recommendations";

const RECOMMENDATION_ROUTE = "**/api/e2e/recommendations";

interface NetworkGuard {
  readonly blockedExternalRequests: string[];
}

async function installExternalNetworkGuard(page: Page): Promise<NetworkGuard> {
  const blockedExternalRequests: string[] = [];

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (
      (requestUrl.protocol === "http:" || requestUrl.protocol === "https:") &&
      requestUrl.hostname !== "127.0.0.1" &&
      requestUrl.hostname !== "localhost"
    ) {
      blockedExternalRequests.push(
        `${requestUrl.origin}${requestUrl.pathname}`,
      );

      await route.abort("blockedbyclient");
      return;
    }

    await route.fallback();
  });

  return { blockedExternalRequests };
}

async function fulfillSuccessfulRecommendations(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(RECOMMENDATION_SUCCESS_FIXTURE),
  });
}

async function chooseRepresentativePreferences(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Movie", exact: true }).click();
  await page.getByRole("button", { name: "Make me laugh" }).click();
  await page.getByRole("button", { name: "Prefer Comedy" }).click();
  await page.getByRole("button", { name: "≤ 2 hr" }).click();

  await expect(
    page.getByRole("button", { name: "Movie", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect(
    page.getByRole("button", { name: "Make me laugh" }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect(
    page.getByRole("button", { name: "Prefer Comedy" }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByRole("button", { name: "≤ 2 hr" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Review preferences" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Review what we understood",
    }),
  ).toBeVisible();
}

function recommendationHeadings(page: Page) {
  return page
    .getByRole("list", { name: "Recommendations" })
    .getByRole("heading", { level: 3 });
}

function sanitizedRequestSummary(request: Request): string {
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}`;
}

test.describe("PickTonight critical visitor journey", () => {
  test("landing page remains fully usable after analytics are declined", async ({
    page,
  }) => {
    const network = await installExternalNetworkGuard(page);

    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Choose what to watch without the endless scroll.",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Help improve PickTonight?",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "No thanks" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Analytics choice: declined",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "What would feel right to watch?",
      }),
    ).toBeVisible();

    expect(network.blockedExternalRequests).toEqual([]);
  });

  test("accepted analytics choice can complete the critical recommendation journey", async ({
    page,
  }) => {
    const network = await installExternalNetworkGuard(page);
    const submittedRequests: unknown[] = [];
    const requestSummaries: string[] = [];

    await page.route(RECOMMENDATION_ROUTE, async (route) => {
      requestSummaries.push(sanitizedRequestSummary(route.request()));
      submittedRequests.push(route.request().postDataJSON());

      await fulfillSuccessfulRecommendations(route);
    });

    await page.goto("/");

    await page.getByRole("button", { name: "Allow analytics" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Analytics choice: allowed",
      }),
    ).toBeVisible();

    await chooseRepresentativePreferences(page);

    await expect(page.getByText("Movie", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Make me laugh", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("120 minutes", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Show 3 picks" }).click();

    await expect(
      page.getByRole("region", {
        name: "3 picks for tonight",
      }),
    ).toBeVisible();

    await expect(recommendationHeadings(page)).toHaveText([
      "Preview movie A",
      "Preview television B",
      "Preview movie C",
    ]);

    expect(requestSummaries).toEqual(["POST /api/e2e/recommendations"]);
    expect(submittedRequests).toHaveLength(1);

    expect(submittedRequests[0]).toMatchObject({
      hardRestrictions: {
        mediaType: "movie",
        maximumRuntimeMinutes: 120,
      },
      softPreferences: {
        mood: "laughing",
        preferredGenreIds: [35],
      },
      watchRegion: "US",
    });

    await page
      .getByRole("button", {
        name: "Details: Preview movie A",
      })
      .click();

    await expect(
      page.getByRole("region", {
        name: "Title details for Preview movie A",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Back to 3 picks" }).click();

    await expect(recommendationHeadings(page)).toHaveText([
      "Preview movie A",
      "Preview television B",
      "Preview movie C",
    ]);

    await page
      .getByRole("button", {
        name: "Save: Preview movie A",
      })
      .click();

    await expect(
      page.getByRole("button", {
        name: "Saved (1)",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Saved (1)" }).click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Saved for later",
      }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "Remove: Preview movie A",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Nothing saved yet",
      }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "Find something to watch",
      })
      .click();

    await expect(recommendationHeadings(page)).toHaveText([
      "Preview movie A",
      "Preview television B",
      "Preview movie C",
    ]);

    await page
      .getByRole("button", {
        name: "More actions: Preview television B",
      })
      .click();

    await page
      .getByRole("button", {
        name: "Not tonight: Preview television B",
      })
      .click();

    await expect(recommendationHeadings(page)).toHaveText([
      "Preview movie A",
      "Preview movie D",
      "Preview movie C",
    ]);

    const visibleTitles = await recommendationHeadings(page).allTextContents();

    expect(new Set(visibleTitles).size).toBe(3);
    expect(visibleTitles).not.toContain("Preview television B");

    await page
      .getByRole("region", {
        name: "Optional feedback for Preview television B",
      })
      .getByRole("button", {
        name: "Skip",
      })
      .click();

    await page
      .getByRole("button", {
        name: "Choose tonight: Preview movie D",
      })
      .click();

    await expect(
      page.getByRole("status", {
        name: "Preview action status",
      }),
    ).toContainText(
      "Watch intent set for Preview movie D. This does not mark the title as watched.",
    );

    expect(network.blockedExternalRequests).toEqual([]);
  });

  test("a recoverable recommendation request failure can be retried", async ({
    page,
  }) => {
    const network = await installExternalNetworkGuard(page);
    let recommendationAttempts = 0;

    await page.route(RECOMMENDATION_ROUTE, async (route) => {
      recommendationAttempts += 1;

      if (recommendationAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "E2E_CONTROLLED_FAILURE",
              message: "Controlled fixture failure.",
            },
          }),
        });
        return;
      }

      await fulfillSuccessfulRecommendations(route);
    });

    await page.goto("/");

    await page.getByRole("button", { name: "No thanks" }).click();

    await page.getByRole("button", { name: "Movie", exact: true }).click();
    await page.getByRole("button", { name: "Review preferences" }).click();
    await page.getByRole("button", { name: "Show 3 picks" }).click();

    const alert = page.getByRole("alert");

    await expect(alert).toContainText(
      "Recommendations are temporarily unavailable",
    );

    await expect(alert).toContainText(
      "PickTonight could not finish this request. Try again shortly.",
    );

    await page
      .getByRole("button", {
        name: "Retry same preferences",
      })
      .click();

    await expect(recommendationHeadings(page)).toHaveText([
      "Preview movie A",
      "Preview television B",
      "Preview movie C",
    ]);

    expect(recommendationAttempts).toBe(2);
    expect(network.blockedExternalRequests).toEqual([]);
  });
});
