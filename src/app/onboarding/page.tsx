import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your profile" };

// Beta Google sign-in: a student's first stop after signing in with their SLU Google
// account, for the two things Google doesn't know. Everyone else goes straight home.
export default async function OnboardingPage() {
  const user = await requireUserPage();
  if (user.role !== Role.STUDENT_INTERN) redirect("/");
  const [profile, groups] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.classGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ program: "asc" }, { name: "asc" }],
      select: { id: true, name: true, program: true },
    }),
  ]);
  if (profile) redirect("/");
  return (
    <AuthShell>
      <OnboardingForm
        email={user.email}
        groups={groups.map((g) => ({ id: g.id, label: `${g.name} (${g.program})` }))}
      />
    </AuthShell>
  );
}
