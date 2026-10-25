"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const selectClass =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";

export function OnboardingForm({
  email,
  groups,
}: {
  email: string;
  groups: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [studentNumber, setStudentNumber] = useState("");
  const [classGroupId, setClassGroupId] = useState(groups[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await sendJson("/api/onboarding", {
      method: "POST",
      body: { studentNumber, classGroupId },
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setError(res.error);
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your profile</CardTitle>
        <CardDescription>
          Signed in as {email}. Two details and you are in: your student number and your class
          group.
        </CardDescription>
        {/* Google newcomers become student accounts; staff accounts are made by an admin. */}
        <p className="text-sm text-foreground/80">
          Faculty or staff? Don&apos;t continue: ask the department coordinator to set up your
          account.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="studentNumber">Student number</Label>
            <Input
              id="studentNumber"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              autoComplete="off"
              required
              aria-invalid={!!error}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="classGroupId">Class group</Label>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No class groups yet. Ask your coordinator to create yours, then come back.
              </p>
            ) : (
              <select
                id="classGroupId"
                value={classGroupId}
                onChange={(e) => setClassGroupId(e.target.value)}
                required
                className={selectClass}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={saving || groups.length === 0}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
