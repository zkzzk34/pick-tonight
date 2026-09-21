import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readStyle(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const styles = {
  analyticsConsent: readStyle("src/styles/analytics-consent.css"),
  global: readStyle("src/styles/global.css"),
  preferenceEntry: readStyle("src/styles/preference-entry.css"),
  savedTitles: readStyle("src/styles/saved-titles.css"),
  titleDetail: readStyle("src/styles/title-detail.css"),
};

function parseHexColor(color) {
  assert.match(
    color,
    /^#[0-9a-f]{6}$/i,
    `Expected a six-digit hex color, received ${color}`,
  );

  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function linearizeChannel(channel) {
  const normalized = channel / 255;

  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color) {
  const [red, green, blue] = parseHexColor(color);

  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);

  const lighter = Math.max(firstLuminance, secondLuminance);

  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function verifyContract({
  label,
  foreground,
  background,
  minimum,
  stylesheet,
}) {
  assert.ok(
    stylesheet.includes(foreground),
    `${label}: foreground ${foreground} is no longer present in the audited stylesheet`,
  );

  assert.ok(
    stylesheet.includes(background),
    `${label}: background ${background} is no longer present in the audited stylesheet`,
  );

  const ratio = contrastRatio(foreground, background);

  assert.ok(
    ratio >= minimum,
    `${label}: ${foreground} against ${background} has contrast ${ratio.toFixed(
      2,
    )}:1; expected at least ${minimum}:1`,
  );
}

describe("authored accessibility contrast contracts", () => {
  it("keeps representative normal text on dark surfaces at or above 4.5:1", () => {
    const contracts = [
      {
        label: "Muted site-footer text",
        foreground: "#8f879f",
        background: "#0c0a13",
        minimum: 4.5,
        stylesheet: styles.global,
      },
      {
        label: "Dialog description text",
        foreground: "#c9c1d6",
        background: "#211b31",
        minimum: 4.5,
        stylesheet: styles.analyticsConsent,
      },
      {
        label: "Recommendation detail secondary text",
        foreground: "#bcb4ca",
        background: "#15111f",
        minimum: 4.5,
        stylesheet: styles.titleDetail,
      },
    ];

    contracts.forEach(verifyContract);
  });

  it("keeps Saved-view text on light card surfaces at or above 4.5:1", () => {
    const contracts = [
      {
        label: "Saved title primary text",
        foreground: "#211942",
        background: "#ffffff",
        minimum: 4.5,
        stylesheet: styles.savedTitles,
      },
      {
        label: "Saved title identity text",
        foreground: "#625c72",
        background: "#ffffff",
        minimum: 4.5,
        stylesheet: styles.savedTitles,
      },
      {
        label: "Saved action text",
        foreground: "#30245f",
        background: "#ffffff",
        minimum: 4.5,
        stylesheet: styles.savedTitles,
      },
    ];

    contracts.forEach(verifyContract);
  });

  it("keeps authored focus indicators at or above 3:1 against audited adjacent surfaces", () => {
    const contracts = [
      {
        label: "Global dark-surface focus fallback",
        foreground: "#ffd18a",
        background: "#0c0a13",
        minimum: 3,
        stylesheet: styles.global,
      },
      {
        label: "Destructive-dialog focus indicator",
        foreground: "#ffd18a",
        background: "#211b31",
        minimum: 3,
        stylesheet: styles.analyticsConsent,
      },
      {
        label: "Title-detail focus indicator",
        foreground: "#ffd078",
        background: "#292237",
        minimum: 3,
        stylesheet: styles.titleDetail,
      },
      {
        label: "Saved light-surface focus indicator",
        foreground: "#7b61ff",
        background: "#ffffff",
        minimum: 3,
        stylesheet: styles.savedTitles,
      },
    ];

    contracts.forEach(verifyContract);
  });

  it("keeps selected and current-control text readable against authored fills", () => {
    const contracts = [
      {
        label: "Selected preference chip on lavender endpoint",
        foreground: "#171021",
        background: "#d8ceff",
        minimum: 4.5,
        stylesheet: styles.preferenceEntry,
      },
      {
        label: "Selected preference chip on gold endpoint",
        foreground: "#171021",
        background: "#ffd18a",
        minimum: 4.5,
        stylesheet: styles.preferenceEntry,
      },
      {
        label: "Current navigation text",
        foreground: "#211942",
        background: "#ffffff",
        minimum: 4.5,
        stylesheet: styles.savedTitles,
      },
    ];

    contracts.forEach(verifyContract);
  });
});
