"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadFromResponse, PasswordAction } from "./password-action";

export function ExportCard({
  kind,
  title,
  description,
  semesterId,
  semesterLabel,
  semesterAware,
}: {
  kind: string;
  title: string;
  description: string;
  semesterId: string | null; // the page's semester filter; null = all semesters
  semesterLabel: string;
  semesterAware: boolean;
}) {
  const router = useRouter();

  async function onConfirm(password: string) {
    const res = await fetch(`/api/admin/exports/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...(semesterAware && semesterId ? { semesterId } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Export failed");
    }
    await downloadFromResponse(res);
    toast.success(`${title} export downloaded`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {semesterAware && (
          <p className="text-sm text-muted-foreground">Semester: {semesterLabel}</p>
        )}
        <PasswordAction
          triggerLabel="Export"
          confirmLabel="Confirm and download"
          description={`Enter your password to download the ${title.toLowerCase()} export.`}
          onConfirm={onConfirm}
        />
      </CardContent>
    </Card>
  );
}
