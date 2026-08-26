import { sendReportStatusEmail } from "@/lib/services/notificationService";

describe("notificationService stubs — reachable and wired correctly", () => {
  // TODO(unassigned — Rhaastas, org invite pending): replace once FR-NT-04
  // email delivery lands.
  it("sendReportStatusEmail resolves without throwing", async () => {
    await expect(sendReportStatusEmail("wr-1", "APPROVE")).resolves.toEqual({ sent: false });
  });
});
