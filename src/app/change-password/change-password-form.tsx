"use client";

import { useState } from "react";
import { FieldError, errorProps } from "@/components/field-error";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { changePasswordSchema } from "@/lib/validators/auth";
import { OFFLINE_MESSAGE, sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    setError(null);
    setIsSubmitting(true);

    const res = await sendJson("/api/auth/change-password", { method: "POST", body: data });

    setIsSubmitting(false);

    if (!res.ok) {
      setError(
        res.body.error === "INVALID_CURRENT_PASSWORD"
          ? "Current password is incorrect."
          : res.body.error === "ACCOUNT_LOCKED"
            ? "Too many wrong attempts. Your account is locked for 15 minutes and you've been signed out."
            : res.status === 0
              ? OFFLINE_MESSAGE
              : "Something went wrong. Please try again."
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{forced ? "Set a new password" : "Change your password"}</CardTitle>
        <CardDescription>
          {forced
            ? "You're using a temporary password. Choose a new one to continue."
            : "Enter your current password and choose a new one."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              {...register("currentPassword")}
              {...errorProps("currentPassword", errors.currentPassword?.message)}
            />
            <FieldError id="currentPassword-error" message={errors.currentPassword?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              {...register("newPassword")}
              {...errorProps("newPassword", errors.newPassword?.message)}
            />
            <FieldError id="newPassword-error" message={errors.newPassword?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              {...register("confirmPassword")}
              {...errorProps("confirmPassword", errors.confirmPassword?.message)}
            />
            <FieldError id="confirmPassword-error" message={errors.confirmPassword?.message} />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Saving..." : "Save password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
