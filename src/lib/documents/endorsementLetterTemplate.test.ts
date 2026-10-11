import { renderEndorsementLetterHtml } from "@/lib/documents/endorsementLetterTemplate";

const data = {
  studentProfileId: "p-1",
  referenceCode: "EL-20261011-ABCD1234",
  endorsementDate: new Date("2026-10-11T00:00:00Z"),
  student: {
    fullName: "Juan Dela Cruz",
    studentNumber: "2026-00123-MN-0",
    program: "BSIT",
    positionTitle: "Web Developer Intern",
    requiredHours: 600,
  },
  company: {
    name: "Acme <Corp>",
    address: "Session Rd, Baguio City",
    supervisorName: "Maria Santos",
    supervisorPosition: "IT Manager",
  },
};

it("contains every FR-DG-01 field, the letterhead, and the reference code", () => {
  const html = renderEndorsementLetterHtml(data);
  for (const text of [
    "Juan Dela Cruz",
    "2026-00123-MN-0",
    "Session Rd, Baguio City",
    "Maria Santos",
    "IT Manager",
    "October 11, 2026",
    "EL-20261011-ABCD1234",
    "Saint Louis University",
    "600 hours",
  ]) {
    expect(html).toContain(text);
  }
});

it("escapes interpolated values", () => {
  expect(renderEndorsementLetterHtml(data)).toContain("Acme &lt;Corp&gt;");
});

it("omits the position line cleanly when the supervisor position is unknown", () => {
  const html = renderEndorsementLetterHtml({
    ...data,
    company: { ...data.company, supervisorPosition: null },
  });
  expect(html).not.toContain("—<br");
});
