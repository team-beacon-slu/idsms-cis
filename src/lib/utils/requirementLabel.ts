const REQUIREMENT_LABELS: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical certificate",
  PSYCHOLOGICAL_CLEARANCE: "Psychological clearance",
  PARENT_CONSENT_UNDERTAKING: "Parent consent and undertaking",
  COMPANY_REPLY_FORM: "Company reply form",
  DATA_PRIVACY_ORIENTATION: "Data privacy orientation",
  INTERNSHIP_ORIENTATION: "Internship orientation",
  GOVERNMENT_COMPANY_PERMIT: "Government or company permit",
  WORK_PLAN: "Work plan",
  MOA: "Memorandum of Agreement (MOA)",
  PROOF_OF_CORPORATE_LEGITIMACY: "Proof of corporate legitimacy",
  INTERNSHIP_AGREEMENT: "Internship agreement",
};

export function requirementLabel(type: string): string {
  return REQUIREMENT_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}
