/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { SiteFooter } from "./site-footer";

it("opens SLU sites in a new tab without handing them this page", () => {
  render(<SiteFooter signedIn />);
  const portal = screen.getByRole("link", { name: /SLU Portal/ });
  expect(portal).toHaveAttribute("href", "https://portal.slu.edu.ph/");
  expect(portal).toHaveAttribute("target", "_blank");
  expect(portal).toHaveAttribute("rel", "noopener noreferrer");
  expect(portal).toHaveAccessibleName("SLU Portal (opens in a new tab)");
});

it("shows Help only to signed-in users", () => {
  const { rerender } = render(<SiteFooter signedIn />);
  expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
  rerender(<SiteFooter signedIn={false} />);
  expect(screen.queryByRole("link", { name: "Help" })).toBeNull();
  expect(screen.getByRole("link", { name: "Privacy notice" })).toBeInTheDocument();
});
