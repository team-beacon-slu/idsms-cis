import { requireUserPage } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

// Deliberately outside the (dashboard) route group — that layout redirects
// here whenever mustResetPassword is true, so this page can't live inside it
// without creating a redirect loop. Still requires a session (FR-UM-04's
// forced change only applies to someone who already authenticated).
export default async function ChangePasswordPage() {
  const user = await requireUserPage();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ChangePasswordForm forced={user.mustResetPassword} />
    </div>
  );
}
