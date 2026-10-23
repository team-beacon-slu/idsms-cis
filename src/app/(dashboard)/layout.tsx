import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserPage } from "@/lib/auth/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { displayName } from "@/lib/utils/displayName";
import { SiteFooter } from "@/components/site-footer";
import { DashboardNav } from "./dashboard-nav";
import { PrivacyConsentDialog } from "./privacy-consent-dialog";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  if (user.mustResetPassword) {
    redirect("/change-password");
  }

  // Who is signed in: a student's legal name, else the account's display name (015), else the email.
  const [profile, consent, cookieStore] = await Promise.all([
    user.role === Role.STUDENT_INTERN
      ? prisma.studentProfile.findUnique({
          where: { userId: user.id },
          select: { fullName: true },
        })
      : null,
    prisma.user.findUnique({
      where: { id: user.id },
      select: { privacyConsentVersion: true, fullName: true },
    }),
    cookies(),
  ]);
  // Set by the sidebar's collapse button (dashboard-nav.tsx).
  const collapsed = cookieStore.get("sidebar")?.value === "collapsed";

  return (
    <div className="group/shell app-backdrop min-h-dvh bg-fixed">
      {/* First stop for keyboard users: past the sidebar, straight to the page. */}
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* print:hidden — the weekly report preview is printed to PDF from the browser */}
      <div className="print:hidden">
        <DashboardNav
          role={user.role}
          name={displayName({
            email: user.email,
            fullName: consent?.fullName,
            studentName: profile?.fullName,
          })}
          email={user.email}
          initialCollapsed={collapsed}
        />
      </div>
      {/* The padding follows the sidebar's own data-collapsed, so folding it needs no re-render here. */}
      <main
        id="main"
        className="md:pl-60 md:transition-[padding] md:duration-200 md:group-has-[aside[data-collapsed=true]]/shell:pl-[72px] print:pl-0"
      >
        {/* Fluid: the canvas follows the window, capped only on very wide screens. */}
        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-12 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
      <SiteFooter
        signedIn
        className="md:pl-60 md:transition-[padding] md:duration-200 md:group-has-[aside[data-collapsed=true]]/shell:pl-[72px]"
      />
      {consent?.privacyConsentVersion !== PRIVACY_NOTICE_VERSION && <PrivacyConsentDialog />}
    </div>
  );
}
