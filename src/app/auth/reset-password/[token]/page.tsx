"use client";

import { useState } from "react";
import { FieldError, errorProps } from "@/components/field-error";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { passwordSchema } from "@/lib/validators/auth";
import { OFFLINE_MESSAGE, sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth-shell";

const formSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ConfirmResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(formSchema) });

  async function onSubmit(data: { newPassword: string; confirmPassword: string }) {
    setError(null);
    setIsSubmitting(true);

    const res = await sendJson("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: params.token, ...data },
    });

    setIsSubmitting(false);

    if (!res.ok) {
      setError(
        res.body.error === "INVALID_OR_EXPIRED_TOKEN"
          ? "This reset link is invalid or has expired. Request a new one."
          : res.status === 0
            ? OFFLINE_MESSAGE
            : "Something went wrong. Please try again."
      );
      return;
    }

    router.push("/login");
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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
              <Label htmlFor="confirmPassword">Confirm password</Label>
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
              {isSubmitting ? "Saving..." : "Reset password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
