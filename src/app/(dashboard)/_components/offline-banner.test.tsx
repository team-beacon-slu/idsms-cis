import { act, render, screen } from "@testing-library/react";
import { OfflineBanner } from "./offline-banner";

function setOnline(online: boolean) {
  jest.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

afterEach(() => jest.restoreAllMocks());

it("shows the banner while offline and hides it on reconnect", () => {
  render(<OfflineBanner />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();

  setOnline(false);
  expect(screen.getByRole("status")).toHaveTextContent("You're offline");

  setOnline(true);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});
