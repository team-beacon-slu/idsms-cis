// Dependency-free on purpose: handleApiError (imported by nearly every API
// route) maps this to a 400, and importing it from documentService would drag
// puppeteer-core/@sparticuz/chromium into every function bundle.

// FR-DG-05: a document is only generated for content the student confirmed.
// FR-FT-01: the final report cover is locked until the hour threshold.
export class FinalReportLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalReportLockedError";
  }
}

export class DocumentNotReadyError extends Error {
  constructor(message = "Submit the report before generating its PDF") {
    super(message);
    this.name = "DocumentNotReadyError";
  }
}
