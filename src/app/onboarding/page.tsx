import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AuthShell } from "@/components/auth-shell";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { PrivacyConsentDialog } from "@/app/(dashboard)/_components/privacy-consent-dialog";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your profile" };

// Beta Google sign-in: a student's first stop after signing in with their SLU Google
// account, for the two things Google doesn't know. Everyone else goes straight home.
export default async function OnboardingPage() {
  const user = await requireUserPage();
  if (user.role !== Role.STUDENT_INTERN) redirect("/");
  const [profile, groups] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    // Groups an adviser holds this semester only (the service enforces the same rule).
    prisma.classGroup.findMany({
      where: { deletedAt: null, facultyGroups: { some: { semester: { isActive: true } } } },
      orderBy: [{ program: "asc" }, { name: "asc" }],
      select: { id: true, name: true, program: true },
    }),
  ]);
  if (profile) redirect("/");
  // FR-CK-05: the privacy notice comes before anything personal is asked or stored.
  if (user.privacyConsentVersion !== PRIVACY_NOTICE_VERSION) {
    return (
      <AuthShell>
        <PrivacyConsentDialog />
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <OnboardingForm
        email={user.email}
        groups={groups.map((g) => ({ id: g.id, label: `${g.name} (${g.program})` }))}
      />
    </AuthShell>
  );
}
