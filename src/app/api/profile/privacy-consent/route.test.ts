/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/auditService", () => ({ logEvent: jest.fn() }));

import { NextRequest } from "next/server";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { requireUserApi } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/auditService";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { POST } from "@/app/api/profile/privacy-consent/route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/profile/privacy-consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockReset();
  jest.mocked(requireUserApi).mockResolvedValue({ id: "u-1" } as never);
});

it("records agreement with the current notice version and logs it", async () => {
  const res = await call({ agree: true });
  expect(res.status).toBe(200);
  expect(prismaMock.user.update).toHaveBeenCalledWith({
    where: { id: "u-1" },
    data: { privacyConsentAt: expect.any(Date), privacyConsentVersion: PRIVACY_NOTICE_VERSION },
  });
  expect(logEvent).toHaveBeenCalledWith(
    expect.objectContaining({ action: "PRIVACY_CONSENT_GIVEN" })
  );
});

it("logs a refusal without recording consent", async () => {
  const res = await call({ agree: false });
  expect(res.status).toBe(200);
  expect(prismaMock.user.update).not.toHaveBeenCalled();
  expect(logEvent).toHaveBeenCalledWith(
    expect.objectContaining({ action: "PRIVACY_CONSENT_DECLINED" })
  );
});

it("rejects a body without a boolean answer", async () => {
  expect((await call({ agree: "yes" })).status).toBe(400);
});
