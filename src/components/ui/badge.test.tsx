/** @jest-environment jsdom */
import { render } from "@testing-library/react";
import { Badge } from "./badge";

// Pages put status badges inside <p> lines. A block element there is invalid HTML:
// the browser closes the <p> early and hydration no longer matches the server.
it("can sit inside a paragraph without breaking hydration", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});

  const { container } = render(
    <p>
      Leave <Badge variant="outline">Approved</Badge>
    </p>
  );

  expect(container.querySelector("p > span")).toHaveTextContent("Approved");
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
