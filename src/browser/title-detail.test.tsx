import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TitleDetail } from "./title-detail";
import { getPreviewTitleDetail } from "./title-detail-preview";

function requireDetail(mediaKey: string) {
  const detail = getPreviewTitleDetail(mediaKey);

  if (detail === null) {
    throw new Error(`Missing preview detail: ${mediaKey}`);
  }

  return detail;
}

describe("TitleDetail", () => {
  it("shows supported decision evidence and structured reasons", () => {
    const detail = requireDetail("preview:movie-a");

    render(
      <TitleDetail
        detail={detail}
        isChosenTonight={false}
        onAction={vi.fn()}
        onBack={vi.fn()}
        onReplace={vi.fn()}
      />,
    );

    const region = screen.getByRole("region", {
      name: "Title details for Preview movie A",
    });

    expect(
      within(region).getByRole("heading", {
        level: 2,
        name: "Preview movie A",
      }),
    ).toBeInTheDocument();

    expect(within(region).getByText("1h 41m")).toBeInTheDocument();

    expect(within(region).getByText("7.6/10 · 840 votes")).toBeInTheDocument();

    expect(within(region).getByText("Released in 2025")).toBeInTheDocument();

    expect(within(region).getByText("Netflix, Max")).toBeInTheDocument();

    expect(within(region).getAllByText("Apple TV")).toHaveLength(2);

    expect(within(region).getByText("Runtime verified")).toBeInTheDocument();

    expect(
      within(region).getByText("Verified restriction"),
    ).toBeInTheDocument();

    expect(within(region).getByText("Genre match")).toBeInTheDocument();

    expect(
      within(region).getByRole("link", {
        name: "JustWatch",
      }),
    ).toHaveAttribute("href", "https://www.justwatch.com/");
  });

  it("shows honest missing-data states without inventing evidence", () => {
    const detail = requireDetail("preview:movie-c");

    render(
      <TitleDetail
        detail={detail}
        isChosenTonight={false}
        onAction={vi.fn()}
        onBack={vi.fn()}
        onReplace={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Poster unavailable for Preview movie C",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Year unavailable")).toBeInTheDocument();
    expect(screen.getByText("Overview unavailable.")).toBeInTheDocument();
    expect(
      screen.getByText("Genre information unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Runtime unavailable.")).toBeInTheDocument();
    expect(screen.getByText("Rating not established.")).toBeInTheDocument();
    expect(
      screen.getByText("Freshness information unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Provider availability unknown for US."),
    ).toBeInTheDocument();
    expect(screen.getByText("Trailer unavailable.")).toBeInTheDocument();
    expect(
      screen.getByText("Fit explanation unavailable."),
    ).toBeInTheDocument();
  });

  it("exposes seven distinct decision actions and preserves watch-intent meaning", () => {
    const detail = requireDetail("preview:movie-a");
    const onAction = vi.fn();
    const onReplace = vi.fn();

    const { rerender } = render(
      <TitleDetail
        detail={detail}
        isChosenTonight={false}
        onAction={onAction}
        onBack={vi.fn()}
        onReplace={onReplace}
      />,
    );

    const labels = [
      "Choose tonight",
      "Save",
      "More like this",
      "Not tonight",
      "Not my taste",
      "Already watched",
      "Replace",
    ];

    for (const label of labels) {
      expect(
        screen.getByRole("button", {
          name: `${label}: Preview movie A`,
        }),
      ).toBeInTheDocument();
    }

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose tonight: Preview movie A",
      }),
    );

    expect(onAction).toHaveBeenCalledWith("choose-tonight", detail);

    expect(
      screen.getByText(/does not mark the title as watched/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replace: Preview movie A",
      }),
    );

    expect(onReplace).toHaveBeenCalledWith(detail);

    rerender(
      <TitleDetail
        detail={detail}
        isChosenTonight
        onAction={onAction}
        onBack={vi.fn()}
        onReplace={onReplace}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Choose tonight: Preview movie A",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    expect(
      screen.getByText("Watch intent set for this title."),
    ).toBeInTheDocument();
  });

  it("opens supported trailer links in a new tab", () => {
    const detail = {
      ...requireDetail("preview:movie-a"),
      trailerUrl: "https://example.com/trailer",
    };

    render(
      <TitleDetail
        detail={detail}
        isChosenTonight={false}
        onAction={vi.fn()}
        onBack={vi.fn()}
        onReplace={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", {
      name: /Watch trailer for Preview movie A/i,
    });

    expect(link).toHaveAttribute("href", "https://example.com/trailer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
