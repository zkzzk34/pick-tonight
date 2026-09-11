import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Attribution } from "./attribution";

describe("Attribution", () => {
  it("presents accessible TMDB and JustWatch credits", () => {
    render(<Attribution />);

    const credits = screen.getByRole("region", { name: "Credits" });
    const tmdbLink = within(credits).getByRole("link", {
      name: "Visit TMDB",
    });
    const tmdbLogo = within(tmdbLink).getByRole("img", { name: "TMDB" });

    expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org");
    expect(tmdbLogo).toHaveAttribute("src", "/tmdb-logo.svg");
    expect(tmdbLogo).toHaveAttribute("width", "512");
    expect(tmdbLogo).toHaveAttribute("height", "369");
    expect(
      within(credits).getByText(
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      ),
    ).toBeInTheDocument();
    expect(
      within(credits).getByRole("link", { name: "JustWatch" }),
    ).toHaveAttribute("href", "https://www.justwatch.com/");
    expect(
      within(credits).getByText(
        /Regional streaming, rental, and purchase availability/,
      ),
    ).toBeInTheDocument();
  });
});
