/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { toast } from "sonner";
import { generatePdfInBackground, ReportPdfActions } from "./report-pdf-actions";

beforeEach(() => {
  refresh.mockClear();
  jest.mocked(toast.error).mockClear();
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

it("recovers the button and tells the user when the request itself fails", async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Failed to fetch"));
  render(<ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status="FAILED" canGenerate />);
  await userEvent.click(screen.getByRole("button", { name: /regenerate pdf/i }));
  expect(toast.error).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /regenerate pdf/i })).toBeEnabled();
});

describe("generatePdfInBackground", () => {
  it("warns that the report is saved but the PDF failed", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "FAILED" }),
    });
    const onSettled = jest.fn();
    await generatePdfInBackground("/api/weekly-reports/wr-1/pdf", onSettled);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/regenerate pdf/i));
    expect(onSettled).toHaveBeenCalled();
  });

  it("turns a network failure into a toast instead of an unhandled rejection", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Failed to fetch"));
    const onSettled = jest.fn();
    await expect(
      generatePdfInBackground("/api/weekly-reports/wr-1/pdf", onSettled)
    ).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalled();
  });
});
