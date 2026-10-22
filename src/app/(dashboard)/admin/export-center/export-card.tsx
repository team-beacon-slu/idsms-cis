"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { downloadFromResponse, PasswordAction } from "./password-action";

export function ExportCard({
  kind,
  title,
  description,
  semesters,
  semesterAware,
}: {
  kind: string;
  title: string;
  description: string;
  semesters: Array<{ id: string; label: string }>;
  semesterAware: boolean;
}) {
  const router = useRouter();
  const selectId = useId();
  const [semesterId, setSemesterId] = useState("");

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
          <div className="space-y-2">
            <Label htmlFor={selectId}>Semester</Label>
            <select
              id={selectId}
              value={semesterId}
              onChange={(e) => setSemesterId(e.target.value)}
              className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <option value="">All semesters</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
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
