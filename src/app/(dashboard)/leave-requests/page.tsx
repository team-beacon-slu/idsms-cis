import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Thin redirect so a student never needs to know their own studentProfileId.
// Query params (prefilled date/type/times from the weekly report) carry over.
export default async function OwnLeaveRequestsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUserPage();
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!studentProfile) {
    redirect("/");
  }

  const query = new URLSearchParams(
    Object.entries(searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
  ).toString();
  redirect(`/students/${studentProfile.id}/leave-requests${query ? `?${query}` : ""}`);
}
