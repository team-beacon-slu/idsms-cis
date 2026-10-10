import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { DashboardNav } from "./dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  if (user.mustResetPassword) {
    redirect("/change-password");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* print:hidden — the weekly report preview is printed to PDF from the browser */}
      <div className="print:hidden">
        <DashboardNav role={user.role} userEmail={user.email} />
      </div>
      <main className="md:pl-64 print:pl-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
