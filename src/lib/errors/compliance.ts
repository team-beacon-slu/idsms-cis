// Phase 4 Workstream G business-rule errors. handleApiError maps the two state
// errors to 409 and ComplianceNotFoundError to 404.

export class DataRequestStateError extends Error {
  name = "DataRequestStateError";
}

export class RetentionStateError extends Error {
  name = "RetentionStateError";
}

export class ComplianceNotFoundError extends Error {
  name = "ComplianceNotFoundError";
}
