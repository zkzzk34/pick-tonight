import axe, {
  type AxeResults,
  type ElementContext,
  type RunOptions,
} from "axe-core";

const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

/**
 * Runs the deterministic WCAG A/AA subset that is meaningful in jsdom.
 *
 * Color contrast is intentionally excluded here because jsdom does not provide
 * browser layout/paint information that axe needs for a trustworthy contrast
 * result. Contrast remains a required real-browser/manual verification item in
 * docs/accessibility-checklist.md.
 */
export async function runAccessibilityScan(
  context: ElementContext,
): Promise<AxeResults> {
  const options: RunOptions = {
    runOnly: {
      type: "tag",
      values: [...WCAG_AA_TAGS],
    },
    rules: {
      "color-contrast": {
        enabled: false,
      },
    },
  };

  return axe.run(context, options);
}

export function formatAccessibilityViolations(results: AxeResults): string {
  if (results.violations.length === 0) {
    return "";
  }

  return results.violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => {
          const targets = node.target.join(", ");

          return `    - ${targets}: ${
            node.failureSummary ?? "No failure summary provided."
          }`;
        })
        .join("\n");

      return [
        `${violation.id}: ${violation.help}`,
        `  Impact: ${violation.impact ?? "unknown"}`,
        `  ${violation.helpUrl}`,
        nodes,
      ].join("\n");
    })
    .join("\n\n");
}
