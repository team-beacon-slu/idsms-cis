/** @jest-environment node */
// Audit 7 Nov: route-level role checks. Every high-risk route is called as each role it
// must refuse; the refusal has to come from requireRole ("Insufficient role"), so a later
// edit that drops or widens a role check fails here.
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));

import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { requireUserApi } from "@/lib/auth/session";
import { resetPrismaMock } from "@/testUtils/prismaMock";

const {
  SUPER_ADMIN: SA,
  DEPARTMENT_COORDINATOR: DC,
  FACULTY_ADVISER: FA,
  STUDENT_INTERN: SI,
} = Role;
const ALL = [SA, DC, FA, SI];

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Response;
type Case = [route: string, method: "GET" | "POST" | "PATCH" | "DELETE", allowed: Role[]];

const CASES: Case[] = [
  // Super Admin only: personal-data exports, deletions, settings, accounts.
  ["admin/data-requests/[id]/export", "POST", [SA]],
  ["admin/data-requests/[id]/fulfil", "POST", [SA]],
  ["admin/exports/[kind]", "POST", [SA]],
  ["admin/retention/[id]/delete", "POST", [SA]],
  ["admin/retention/[id]/keep", "POST", [SA]],
  ["audit-logs/export", "GET", [SA]],
  ["config/ai", "PATCH", [SA]],
  ["config/checklist", "PATCH", [SA]],
  ["config/deductions", "PATCH", [SA]],
  ["config/maintenance", "PATCH", [SA]],
  ["semesters/[semesterId]/activate", "POST", [SA]],
  ["semesters/[semesterId]/archive", "POST", [SA]],
  ["users/[id]/force-logout", "POST", [SA]],
  ["users/[id]/unlock", "POST", [SA]],
  // Coordinator and Super Admin: department set-up.
  ["users/bulk-import", "POST", [SA, DC]],
  ["config/required-hours", "PATCH", [DC, SA]],
  ["companies/merge", "POST", [DC, SA]],
  ["class-group-advisers/[id]", "DELETE", [DC, SA]],
  ["class-groups/copy-advisers", "POST", [DC, SA]],
  ["company-days", "POST", [DC, SA]],
  ["department-events", "POST", [DC, SA]],
  ["work-plans/[id]/schedule-change/coordinator-review", "PATCH", [DC, SA]],
  // Reviews: an intern must never approve their own work.
  ["weekly-reports/[id]/review", "PATCH", [FA]],
  ["work-plans/[id]/schedule-change/faculty-review", "PATCH", [FA]],
  ["checklist-items/bulk-review", "POST", [FA, DC, SA]],
  // Intern-only writes: staff can't file or submit on an intern's behalf.
  ["weekly-reports/[id]/submit", "POST", [SI]],
  ["companies/[id]/join", "POST", [SI]],
];

const ID = "00000000-0000-4000-8000-000000000001";
const params = Promise.resolve(new Proxy({} as Record<string, string>, { get: () => ID }));

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(requireUserApi).mockReset();
});

describe.each(CASES)("%s %s", (route, method, allowed) => {
  const refused = ALL.filter((role) => !allowed.includes(role));

  it.each(refused)("refuses %s", async (role) => {
    jest.mocked(requireUserApi).mockResolvedValue({
      id: "u-1",
      role,
      isActive: true,
      mustResetPassword: false,
    } as never);
    const mod = (await import(`@/app/api/${route}/route`)) as Record<string, Handler>;
    const req = new NextRequest(`http://localhost/api/${route}`, {
      method,
      ...(method !== "GET" && {
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    });

    const res = await mod[method](req, { params });

    expect([401, 403]).toContain(res.status);
    expect((await res.json()).error).toBe("Insufficient role");
  });
});
