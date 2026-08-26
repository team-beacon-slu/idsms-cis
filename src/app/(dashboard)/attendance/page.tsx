import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Thin redirect so a student never needs to know their own studentProfileId.
export default async function OwnAttendancePage() {
  const user = await requireUserPage();
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!studentProfile) {
    redirect("/");
  }

  redirect(`/students/${studentProfile.id}/attendance`);
}
