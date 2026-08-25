import { requireUserPage } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/services/userService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ProfilePage() {
  const user = await requireUserPage();
  const profile = await getUserProfile(user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-sm text-muted-foreground">Email</span>
          <p>{profile?.email}</p>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">Role</span>
          <div>
            <Badge variant="secondary">{profile?.role}</Badge>
          </div>
        </div>
        {profile?.studentProfile && (
          <div>
            <span className="text-sm text-muted-foreground">Student number</span>
            <p>{profile.studentProfile.studentNumber}</p>
          </div>
        )}
        <Link href="/change-password" className="text-sm underline">
          Change password
        </Link>
      </CardContent>
    </Card>
  );
}
