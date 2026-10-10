import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export function WeeklyReportStatusEmail({
  status,
  weekStart,
  weekEnd,
  notes,
  reportUrl,
}: {
  status: string;
  weekStart: Date;
  weekEnd: Date;
  notes?: string;
  reportUrl?: string;
}) {
  const format = (date: Date) =>
    date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return (
    <Html lang="en">
      <Head />
      <Preview>Your weekly report has been {status}.</Preview>
      <Body style={{ backgroundColor: "#f3f4f6", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px" }}>
          <Text>IDSMS-CIS · Team Beacon</Text>
          <Heading>Weekly report {status}</Heading>
          <Text>
            Reporting period: {format(weekStart)} – {format(weekEnd)}
          </Text>
          {notes && (
            <>
              <Heading as="h2">Faculty feedback</Heading>
              <Text style={{ whiteSpace: "pre-wrap" }}>{notes}</Text>
            </>
          )}
          {reportUrl && (
            <Button
              href={reportUrl}
              style={{
                backgroundColor: "#1e3a8a",
                color: "#ffffff",
                padding: "12px 20px",
                borderRadius: "6px",
              }}
            >
              View report
            </Button>
          )}
          <Text>
            {status === "returned"
              ? "Please review the feedback, revise your report, and resubmit it in the system."
              : "Open the system to review the report and your updated internship progress."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
