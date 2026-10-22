import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserPage } from "@/lib/auth/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { DashboardNav } from "./dashboard-nav";
import { PrivacyConsentDialog } from "./privacy-consent-dialog";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  if (user.mustResetPassword) {
    redirect("/change-password");
  }

  // Students are shown by name when their profile has one; staff accounts only have an email.
  const [profile, consent] = await Promise.all([
    user.role === Role.STUDENT_INTERN
      ? prisma.studentProfile.findUnique({
          where: { userId: user.id },
          select: { fullName: true },
        })
      : null,
    prisma.user.findUnique({ where: { id: user.id }, select: { privacyConsentVersion: true } }),
  ]);

  return (
    <div className="app-backdrop min-h-dvh bg-fixed">
      {/* print:hidden — the weekly report preview is printed to PDF from the browser */}
      <div className="print:hidden">
        <DashboardNav role={user.role} userLabel={profile?.fullName || user.email} />
      </div>
      <main className="md:pl-60 print:pl-0">
        {/* Fluid: the canvas follows the window, capped only on very wide screens. */}
        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-12 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
      {consent?.privacyConsentVersion !== PRIVACY_NOTICE_VERSION && <PrivacyConsentDialog />}
    </div>
  );
}
