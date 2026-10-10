import Link from "next/link";
import { KeyRound, Mail, ShieldCheck, IdCard, ArrowRight } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/services/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function humanizeRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function ProfilePage() {
  const user = await requireUserPage();
  const profile = await getUserProfile(user.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account details and access level.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Information tied to your sign-in credentials.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="flex items-center gap-3 py-3 first:pt-0">
            <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
              <Mail className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="truncate text-sm font-medium text-foreground">{profile?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3">
            <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Role</p>
              <div className="mt-0.5">
                <Badge variant="secondary">{profile ? humanizeRole(profile.role) : "—"}</Badge>
              </div>
            </div>
          </div>

          {profile?.studentProfile && (
            <div className="flex items-center gap-3 py-3">
              <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
                <IdCard className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Student number</p>
                <p className="text-sm font-medium text-foreground">
                  {profile.studentProfile.studentNumber}
                </p>
              </div>
            </div>
          )}

          <div className="pt-3 last:pb-0">
            <Link
              href="/change-password"
              className="group inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Change password
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
