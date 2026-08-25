import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { DashboardNav } from "./dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  if (user.mustResetPassword) {
    redirect("/change-password");
  }

  return (
    <div className="min-h-screen">
      <DashboardNav role={user.role} />
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
