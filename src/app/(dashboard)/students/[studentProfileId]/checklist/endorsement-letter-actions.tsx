import { ReportPdfActions } from "../weekly-reports/report-pdf-actions";

export function EndorsementLetterActions({
  studentProfileId,
  status,
  canGenerate,
}: {
  studentProfileId: string;
  status: "GENERATED" | "FAILED" | "PENDING_DRAFT" | null;
  canGenerate: boolean;
}) {
  return (
    <ReportPdfActions
      endpoint={`/api/students/${studentProfileId}/endorsement-letter`}
      status={status}
      canGenerate={canGenerate}
    />
  );
}
