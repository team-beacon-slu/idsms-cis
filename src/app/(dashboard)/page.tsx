import { requireUserPage } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardHomePage() {
  const user = await requireUserPage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}.</p>
      </CardContent>
    </Card>
  );
}
