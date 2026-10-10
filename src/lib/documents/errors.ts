// Dependency-free on purpose: handleApiError (imported by nearly every API
// route) maps this to a 400, and importing it from documentService would drag
// puppeteer-core/@sparticuz/chromium into every function bundle.

// FR-DG-05: a document is only generated for content the student confirmed.
export class DocumentNotReadyError extends Error {
  constructor(message = "Submit the report before generating its PDF") {
    super(message);
    this.name = "DocumentNotReadyError";
  }
}
