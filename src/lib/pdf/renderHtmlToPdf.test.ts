// Both browser packages are mocked with factories so Jest never loads the
// real ESM builds or a Chrome binary.
jest.mock("puppeteer-core", () => ({ __esModule: true, default: { launch: jest.fn() } }));
jest.mock("@sparticuz/chromium", () => ({
  __esModule: true,
  default: { args: ["--no-sandbox"], executablePath: jest.fn() },
}));

import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";
import { renderHtmlToPdf, resolveBrowserLaunch } from "@/lib/pdf/renderHtmlToPdf";

const launch = puppeteer.launch as jest.Mock;
const chromiumPath = Chromium.executablePath as jest.Mock;

function fakeBrowser(pdfBytes = new Uint8Array([37, 80, 68, 70])) {
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(pdfBytes),
  };
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
  return { browser, page };
}

const ORIGINAL_ENV = process.env.PUPPETEER_EXECUTABLE_PATH;
afterEach(() => {
  process.env.PUPPETEER_EXECUTABLE_PATH = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("resolveBrowserLaunch", () => {
  it("prefers a local browser from PUPPETEER_EXECUTABLE_PATH", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "C:/Chrome/chrome.exe";
    await expect(resolveBrowserLaunch()).resolves.toEqual({
      executablePath: "C:/Chrome/chrome.exe",
      args: [],
    });
    expect(chromiumPath).not.toHaveBeenCalled();
  });

  it("falls back to @sparticuz/chromium (Vercel/Linux)", async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    chromiumPath.mockResolvedValue("/tmp/chromium");
    await expect(resolveBrowserLaunch()).resolves.toEqual({
      executablePath: "/tmp/chromium",
      args: ["--no-sandbox"],
    });
  });
});

describe("renderHtmlToPdf", () => {
  it("prints the HTML to an A4 PDF buffer and always closes the browser", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    const pdf = await renderHtmlToPdf("<p>hi</p>");

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(page.setContent).toHaveBeenCalledWith(
      "<p>hi</p>",
      expect.objectContaining({ waitUntil: "load" })
    );
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: "A4", printBackground: true })
    );
    expect(browser.close).toHaveBeenCalled();
  });

  it("closes the browser even when printing throws", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    const { browser, page } = fakeBrowser();
    page.pdf.mockRejectedValue(new Error("Target closed"));
    launch.mockResolvedValue(browser);

    await expect(renderHtmlToPdf("<p>hi</p>")).rejects.toThrow("Target closed");
    expect(browser.close).toHaveBeenCalled();
  });

  it("keeps a good PDF when closing the browser fails", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { browser } = fakeBrowser();
    browser.close.mockRejectedValue(new Error("Browser already gone"));
    launch.mockResolvedValue(browser);

    await expect(renderHtmlToPdf("<p>hi</p>")).resolves.toBeInstanceOf(Buffer);
  });

  it("bounds the browser launch with the same timeout", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    const { browser } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await renderHtmlToPdf("<p>hi</p>", 15_000);

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15_000 }));
  });
});
