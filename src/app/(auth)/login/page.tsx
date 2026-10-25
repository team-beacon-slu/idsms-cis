"use client";

import { Suspense, useState } from "react";
import { FieldError, errorProps } from "@/components/field-error";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { AlertCircle, Loader2, Lock, Mail } from "lucide-react";
import { loginSchema } from "@/lib/validators/auth";
import { safeInternalPath } from "@/lib/utils/safeInternalPath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth-shell";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  ACCOUNT_LOCKED:
    "This account is locked due to too many failed attempts. Try again later or reset your password.",
  ACCOUNT_INACTIVE: "This account has been deactivated. Contact a Department Coordinator.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-site paths, so a crafted link can't send a signed-in user to another site.
  const callbackUrl = safeInternalPath(searchParams.get("callbackUrl")) ?? "/";

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: { email: string; password: string }) {
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError(ERROR_MESSAGES[result.error] ?? "Something went wrong. Please try again.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-bold tracking-tight text-brand-900">Sign in</h1>
          </CardTitle>
          <CardDescription>Enter your credentials to access your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="pl-9"
                  {...register("email")}
                  {...errorProps("email", errors.email?.message)}
                />
              </div>
              <FieldError id="email-error" message={errors.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                className="pl-9"
                icon={
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                }
                {...register("password")}
                {...errorProps("password", errors.password?.message)}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link
              href="/auth/reset-password"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Forgot your password?
            </Link>
          </p>
        </CardContent>
      </Card>
      {/* Text over the painted scene sits on glass (the plan's scene rule). */}
      <p className="mx-auto mt-4 w-fit rounded-lg glass px-3 py-1.5 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy notice
        </Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of use
        </Link>
      </p>
    </AuthShell>
  );
}
