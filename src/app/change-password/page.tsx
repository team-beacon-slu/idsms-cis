import { requireUserPage } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth-shell";
import { ChangePasswordForm } from "./change-password-form";

// Deliberately outside the (dashboard) route group — that layout redirects
// here whenever mustResetPassword is true, so this page can't live inside it
// without creating a redirect loop. Still requires a session (FR-UM-04's
// forced change only applies to someone who already authenticated).
export default async function ChangePasswordPage() {
  const user = await requireUserPage();

  return (
    <AuthShell>
      <ChangePasswordForm forced={user.mustResetPassword} />
    </AuthShell>
  );
}
