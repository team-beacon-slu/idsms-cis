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
      <DashboardNav role={user.role} userEmail={user.email} />
      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
