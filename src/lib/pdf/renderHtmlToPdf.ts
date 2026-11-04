import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";

// FR-DG-06: server-side Puppeteer rendering. On Vercel/Linux the browser is
// @sparticuz/chromium's bundled build; on a developer machine (Windows/macOS)
// set PUPPETEER_EXECUTABLE_PATH to a local Chrome or Edge, since the
// bundled binary is Linux-only.
export async function resolveBrowserLaunch(): Promise<{ executablePath: string; args: string[] }> {
  const local = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (local) {
    // The Docker image sets PUPPETEER_ARGS="--no-sandbox": Chrome as a non-root container user has no sandbox.
    return {
      executablePath: local,
      args: process.env.PUPPETEER_ARGS?.split(" ").filter(Boolean) ?? [],
    };
  }
  return { executablePath: await Chromium.executablePath(), args: Chromium.args };
}

const CLOSE_TIMEOUT_MS = 5_000;

// Each step (launch, load, print) gets `timeoutMs`, so one attempt is bounded
// at ~3× that — documentService's retry deadline is sized against it.
export async function renderHtmlToPdf(html: string, timeoutMs = 15_000): Promise<Buffer> {
  const { executablePath, args } = await resolveBrowserLaunch();
  const browser = await puppeteer.launch({
    executablePath,
    args,
    headless: true,
    timeout: timeoutMs,
  });
  try {
    const page = await browser.newPage();
    // setContent, not goto — the HTML is already rendered server-side, so no
    // session cookies ever need to be handed to the headless browser.
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    // A template's @page size wins (SLU long bond 8.5x13in, A4 for VPAA forms); A4 otherwise.
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      timeout: timeoutMs,
    });
    return Buffer.from(pdf);
  } finally {
    // A crashed or hung Chrome must neither replace the real error nor
    // discard a PDF that already printed, so close is time-boxed and logged.
    await Promise.race([
      browser.close(),
      new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS).unref?.()),
    ]).catch((error) => console.error("Failed to close headless Chrome", error));
  }
}
