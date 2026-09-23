import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import {
  LONG_CONTENT_RECOMMENDATION_FIXTURE,
  LONG_CONTENT_TITLE,
  RECOMMENDATION_SUCCESS_FIXTURE,
} from "./fixtures/recommendations";

const RECOMMENDATION_ROUTE = "**/api/e2e/recommendations";

const VIEWPORTS = [
  {
    id: "narrow-phone",
    label: "narrow phone",
    width: 320,
    height: 568,
  },
  {
    id: "larger-phone",
    label: "larger phone",
    width: 430,
    height: 932,
  },
  {
    id: "tablet",
    label: "tablet",
    width: 768,
    height: 1024,
  },
  {
    id: "laptop",
    label: "laptop",
    width: 1366,
    height: 768,
  },
  {
    id: "wide-desktop",
    label: "wide desktop",
    width: 1920,
    height: 1080,
  },
] as const;

const CROSS_BROWSER_VIEWPORT_IDS = new Set(["narrow-phone", "laptop"]);

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

async function fulfillJson(
  route: Route,
  value: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      clientWidth: documentElement.clientWidth,
      scrollWidth: Math.max(
        documentElement.scrollWidth,
        body?.scrollWidth ?? 0,
      ),
    };
  });

  expect(
    dimensions.scrollWidth,
    `document width ${dimensions.scrollWidth}px exceeded viewport width ${dimensions.clientWidth}px`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertMinimumInteractiveTargetSize(page: Page): Promise<void> {
  const undersizedTargets = await page
    .locator(
      [
        "nav button:not(:disabled)",
        "main button:not(:disabled)",
        "main input:not(:disabled)",
        "main select:not(:disabled)",
        "main textarea:not(:disabled)",
        "main summary",
        "dialog button:not(:disabled)",
      ].join(", "),
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return [];
        }

        if (rect.width >= 23.5 && rect.height >= 23.5) {
          return [];
        }

        const label =
          element.getAttribute("aria-label") ??
          element.textContent?.trim() ??
          element.tagName.toLowerCase();

        return [`${label}: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`];
      }),
    );

  expect(
    undersizedTargets,
    "Visible primary interactive targets must meet the 24x24 CSS pixel baseline.",
  ).toEqual([]);
}

async function assertHighUseTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();

  expect(
    box,
    "Expected high-use control to have a rendered box.",
  ).not.toBeNull();

  if (box === null) {
    return;
  }

  expect(
    box.width,
    "High-use control should be approximately 44 CSS pixels wide or larger.",
  ).toBeGreaterThanOrEqual(43.5);

  expect(
    box.height,
    "High-use control should be approximately 44 CSS pixels tall or larger.",
  ).toBeGreaterThanOrEqual(43.5);
}

async function chooseRepresentativePreferences(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Movie", exact: true }).click();
  await page.getByRole("button", { name: "Make me laugh" }).click();
  await page.getByRole("button", { name: "Prefer Comedy" }).click();
  await page.getByRole("button", { name: "≤ 2 hr" }).click();
}

function recommendationHeadings(page: Page): Locator {
  return page
    .getByRole("list", { name: "Recommendations" })
    .getByRole("heading", { level: 3 });
}

async function applyLongVisibleLabelStress(page: Page): Promise<void> {
  const replacements = [
    {
      target: page.getByRole("button", {
        name: "Choose",
        exact: true,
      }),
      text: "Choose something appropriate for everyone watching this evening",
    },
    {
      target: page.getByRole("button", {
        name: "Saved (0)",
        exact: true,
      }),
      text: "Recommendations saved to consider on another evening",
    },
    {
      target: page.getByRole("button", {
        name: `Details: ${LONG_CONTENT_TITLE}`,
      }),
      text: "Open the complete detailed information for this recommendation",
    },
    {
      target: page.getByRole("button", {
        name: `Save: ${LONG_CONTENT_TITLE}`,
      }),
      text: "Save this recommendation so it can be considered another time",
    },
    {
      target: page.getByRole("button", {
        name: `More actions: ${LONG_CONTENT_TITLE}`,
      }),
      text: "Show additional actions available for this recommendation",
    },
  ];

  for (const replacement of replacements) {
    await replacement.target.evaluate((element, text) => {
      element.textContent = text;
    }, replacement.text);
  }
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.label} keeps the complete primary UI operable`, async ({
    browserName,
    page,
  }) => {
    test.skip(
      browserName !== "chromium" &&
        !CROSS_BROWSER_VIEWPORT_IDS.has(viewport.id),
      "Firefox and WebKit use the selected narrow-phone and laptop compatibility subset.",
    );

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const network = await installExternalNetworkGuard(page);

    await page.route(RECOMMENDATION_ROUTE, async (route) => {
      await fulfillJson(route, LONG_CONTENT_RECOMMENDATION_FIXTURE);
    });

    await page.goto("/");

    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "No thanks",
      }),
    );

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "Choose",
        exact: true,
      }),
    );

    await page
      .getByRole("button", {
        name: "Reset all PickTonight data",
      })
      .click();

    const resetDialog = page.getByRole("alertdialog", {
      name: "Reset all PickTonight data?",
    });

    await expect(resetDialog).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    await assertHighUseTarget(
      resetDialog.getByRole("button", {
        name: "Cancel",
      }),
    );

    await resetDialog
      .getByRole("button", {
        name: "Cancel",
      })
      .click();

    await page.getByRole("button", { name: "No thanks" }).click();

    await expect(
      page.getByRole("heading", {
        name: "What would feel right to watch?",
      }),
    ).toBeVisible();

    await chooseRepresentativePreferences(page);

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "Movie",
        exact: true,
      }),
    );

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "Review preferences",
      }),
    );

    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    await page
      .getByRole("button", {
        name: "Review preferences",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Review what we understood",
      }),
    ).toBeVisible();

    await assertNoHorizontalOverflow(page);

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "Show 3 picks",
      }),
    );

    await page
      .getByRole("button", {
        name: "Show 3 picks",
      })
      .click();

    await expect(
      page.getByRole("region", {
        name: "3 picks for tonight",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 3,
        name: LONG_CONTENT_TITLE,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("img", {
        name: /^Poster unavailable for /,
      }),
    ).toHaveCount(3);

    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    await assertHighUseTarget(
      page.getByRole("button", {
        name: `Details: ${LONG_CONTENT_TITLE}`,
      }),
    );

    await page
      .getByRole("button", {
        name: `Details: ${LONG_CONTENT_TITLE}`,
      })
      .click();

    await expect(
      page.getByRole("region", {
        name: `Title details for ${LONG_CONTENT_TITLE}`,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("img", {
        name: `Poster unavailable for ${LONG_CONTENT_TITLE}`,
      }),
    ).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    await assertHighUseTarget(
      page.getByRole("button", {
        name: "Back to 3 picks",
      }),
    );

    await page
      .getByRole("button", {
        name: "Back to 3 picks",
      })
      .click();

    await expect(recommendationHeadings(page)).toHaveCount(3);

    await applyLongVisibleLabelStress(page);

    await assertNoHorizontalOverflow(page);
    await assertMinimumInteractiveTargetSize(page);

    expect(network.blockedExternalRequests).toEqual([]);
  });
}

test("consent, watchlist storage, and in-app back navigation work in every supported engine", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 1366,
    height: 768,
  });

  const network = await installExternalNetworkGuard(page);

  await page.route(RECOMMENDATION_ROUTE, async (route) => {
    await fulfillJson(route, RECOMMENDATION_SUCCESS_FIXTURE);
  });

  await page.goto("/");

  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Movie", exact: true }).click();
  await page.getByRole("button", { name: "Review preferences" }).click();
  await page.getByRole("button", { name: "Show 3 picks" }).click();

  await expect(recommendationHeadings(page)).toHaveText([
    "Preview movie A",
    "Preview television B",
    "Preview movie C",
  ]);

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

  await page
    .getByRole("button", {
      name: "Back to 3 picks",
    })
    .click();

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

  await page.reload();

  await expect(
    page.getByRole("heading", {
      name: "Analytics choice: declined",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", {
      name: "Saved (1)",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Saved (1)",
    })
    .click();

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Saved for later",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", {
      name: "Preview movie A",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Choose",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "What would feel right to watch?",
    }),
  ).toBeVisible();

  expect(network.blockedExternalRequests).toEqual([]);
});

test("narrow layout handles loading, empty, error, retry, and replacement states", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 320,
    height: 568,
  });

  const network = await installExternalNetworkGuard(page);

  let recommendationAttempt = 0;
  let releaseFirstRequest: () => void = () => {};

  const firstRequestGate = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });

  await page.route(RECOMMENDATION_ROUTE, async (route) => {
    recommendationAttempt += 1;

    if (recommendationAttempt === 1) {
      await firstRequestGate;

      await fulfillJson(route, {
        status: "empty",
      });
      return;
    }

    if (recommendationAttempt === 2) {
      await fulfillJson(
        route,
        {
          error: {
            code: "E2E_CONTROLLED_FAILURE",
            message: "Controlled compatibility failure.",
          },
        },
        503,
      );
      return;
    }

    await fulfillJson(route, RECOMMENDATION_SUCCESS_FIXTURE);
  });

  await page.goto("/");

  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Movie", exact: true }).click();
  await page.getByRole("button", { name: "Review preferences" }).click();
  await page.getByRole("button", { name: "Show 3 picks" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Finding your picks",
    }),
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

  releaseFirstRequest();

  await expect(
    page.getByRole("heading", {
      name: "No eligible recommendations",
    }),
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);

  await page
    .getByRole("button", {
      name: "Back to request",
    })
    .click();

  await page
    .getByRole("button", {
      name: "Review preferences",
    })
    .click();

  await page
    .getByRole("button", {
      name: "Show 3 picks",
    })
    .click();

  const alert = page.getByRole("alert");

  await expect(alert).toContainText(
    "Recommendations are temporarily unavailable",
  );

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

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

  await assertNoHorizontalOverflow(page);

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

  await expect(
    page.getByRole("region", {
      name: "Optional feedback for Preview television B",
    }),
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

  await page
    .getByRole("region", {
      name: "Optional feedback for Preview television B",
    })
    .getByRole("button", {
      name: "Skip",
    })
    .click();

  expect(recommendationAttempt).toBe(3);
  expect(network.blockedExternalRequests).toEqual([]);
});

test("200 percent text sizing remains operable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 320,
    height: 568,
  });

  const network = await installExternalNetworkGuard(page);

  await page.route(RECOMMENDATION_ROUTE, async (route) => {
    await fulfillJson(route, LONG_CONTENT_RECOMMENDATION_FIXTURE);
  });

  await page.goto("/");

  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Movie", exact: true }).click();
  await page.getByRole("button", { name: "Review preferences" }).click();
  await page.getByRole("button", { name: "Show 3 picks" }).click();

  await expect(
    page.getByRole("heading", {
      level: 3,
      name: LONG_CONTENT_TITLE,
    }),
  ).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const rootFontSize = await page.evaluate(() =>
    Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    ),
  );

  expect(rootFontSize).toBeGreaterThanOrEqual(31.5);

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

  await page
    .getByRole("button", {
      name: `Details: ${LONG_CONTENT_TITLE}`,
    })
    .click();

  await expect(
    page.getByRole("region", {
      name: `Title details for ${LONG_CONTENT_TITLE}`,
    }),
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

  await page
    .getByRole("button", {
      name: "Back to 3 picks",
    })
    .click();

  await page
    .getByRole("button", {
      name: "Reset all PickTonight data",
    })
    .click();

  const resetDialog = page.getByRole("alertdialog", {
    name: "Reset all PickTonight data?",
  });

  await expect(resetDialog).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await assertMinimumInteractiveTargetSize(page);

  await resetDialog
    .getByRole("button", {
      name: "Cancel",
    })
    .click();

  expect(network.blockedExternalRequests).toEqual([]);
});
