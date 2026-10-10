/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { ReportPdfActions } from "./report-pdf-actions";

beforeEach(() => {
  refresh.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "GENERATED" }),
  }) as jest.Mock;
});

it("links to the download route when the PDF is generated", () => {
  render(
    <ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status="GENERATED" canGenerate />
  );
  expect(screen.getByRole("link", { name: /download pdf/i })).toHaveAttribute(
    "href",
    "/api/weekly-reports/wr-1/pdf"
  );
});

it("offers Regenerate after a failure and POSTs to the endpoint", async () => {
  render(<ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status="FAILED" canGenerate />);
  await userEvent.click(screen.getByRole("button", { name: /regenerate pdf/i }));
  expect(global.fetch).toHaveBeenCalledWith("/api/weekly-reports/wr-1/pdf", { method: "POST" });
  expect(refresh).toHaveBeenCalled();
});

it("shows nothing actionable to a viewer who cannot generate and has no PDF", () => {
  const { container } = render(
    <ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status={null} canGenerate={false} />
  );
  expect(container).toBeEmptyDOMElement();
});
