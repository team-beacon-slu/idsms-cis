"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { requestPasswordResetSchema } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth-shell";

export default function RequestResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(requestPasswordResetSchema) });

  async function onSubmit(data: { email: string }) {
    setIsSubmitting(true);
    await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setIsSubmitting(false);
    // The API always responds the same way regardless of whether the email
    // exists (FR-UM-10 — no enumeration leak), so the UI does too.
    setSubmitted(true);
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>We&apos;ll send a reset link to your SLU email.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400">
              <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                If an account with that email exists, a reset link has been sent. Check your inbox.
              </span>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" {...register("email")} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
