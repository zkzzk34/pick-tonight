import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SavedTitles } from "./saved-titles";

describe("SavedTitles", () => {
  it("explains the session-only fallback without implying persistence", () => {
    render(
      <SavedTitles
        onChoose={() => undefined}
        onRemoveTitle={() => undefined}
        persistence="session-only"
        savedTitles={[]}
      />,
    );

    expect(
      screen.getByText(/persistent browser storage is unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/only for this open visit/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find something to watch" }),
    ).toBeEnabled();
  });
});
