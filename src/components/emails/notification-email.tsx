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

// FR-NT-04 generic template for every trigger except the weekly-report
// status email (#70), which keeps its own richer template.
export function NotificationEmail({
  title,
  body,
  link,
}: {
  title: string;
  body: string;
  link?: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL ?? "";
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f7f9" }}>
        <Container
          style={{ backgroundColor: "#ffffff", padding: 24, borderRadius: 8, maxWidth: 600 }}
        >
          <Heading as="h2" style={{ color: "#1e3a5f" }}>
            {title}
          </Heading>
          <Text>{body}</Text>
          {link && (
            <Button
              href={`${appUrl}${link}`}
              style={{
                backgroundColor: "#2563eb",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Open IDSMS
            </Button>
          )}
          <Text style={{ color: "#888", fontSize: 12 }}>
            Saint Louis University · SAMCIS · IDSMS-CIS
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
