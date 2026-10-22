"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FieldError, errorProps } from "@/components/field-error";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createCompanySchema } from "@/lib/validators/company";
import { WORK_MODALITY_LABEL } from "@/lib/utils/labels";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const WORK_MODALITIES = ["ON_SITE", "WORK_FROM_HOME", "HYBRID"] as const;

type Match = { id: string; name: string; address: string };

export function CompanyForm({ showPositionTitle }: { showPositionTitle: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(createCompanySchema) });
  const name = useWatch({ control, name: "name" }) as string | undefined;
  const [similar, setSimilar] = useState<Match[]>([]);

  // FR-MOA-02: offer the companies already registered under a similar name before a copy is made.
  useEffect(() => {
    const query = name?.trim() ?? "";
    const timer = setTimeout(async () => {
      if (query.length < 3) return setSimilar([]);
      const res = await sendJson(`/api/companies/similar?name=${encodeURIComponent(query)}`, {
        method: "GET",
      });
      if (res.ok) setSimilar((res.body as { companies: Match[] }).companies);
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

  async function join(companyId: string) {
    setIsSubmitting(true);
    const positionTitle = (getValues("positionTitle") as string | undefined)?.trim() || undefined;
    const res = await sendJson(`/api/companies/${companyId}/join`, {
      method: "POST",
      body: { positionTitle },
    });
    setIsSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Linked to your company");
    router.push(`/companies/${companyId}`);
  }

  async function onSubmit(data: Record<string, unknown>) {
    setIsSubmitting(true);
    const res = await sendJson("/api/companies", { method: "POST", body: data });
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    toast.success("Company registered");
    router.push(`/companies/${String(res.body.id)}`);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Register a company</CardTitle>
        <CardDescription>
          FR-MOA-01: any student or staff member can register a host company.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              {...register("name")}
              {...errorProps("name", errors.name?.message as string | undefined)}
            />
            <FieldError id="name-error" message={errors.name?.message as string | undefined} />
            {similar.length > 0 && (
              <div
                role="status"
                className="space-y-2 rounded-lg border border-notice-border bg-notice p-3 text-sm text-notice-foreground"
              >
                <p className="font-medium">Already registered? Use it instead of adding a copy.</p>
                <ul className="space-y-2">
                  {similar.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium">{c.name}</span>
                        <span className="opacity-80"> · {c.address}</span>
                      </span>
                      {showPositionTitle ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => void join(c.id)}
                          className="cursor-pointer"
                        >
                          This is my company
                        </Button>
                      ) : (
                        <Link href={`/companies/${c.id}`} className="font-medium underline">
                          View
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              {...register("address")}
              {...errorProps("address", errors.address?.message as string | undefined)}
            />
            <FieldError
              id="address-error"
              message={errors.address?.message as string | undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workModality">Work modality</Label>
            <select
              id="workModality"
              {...register("workModality")}
              className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              {WORK_MODALITIES.map((modality) => (
                <option key={modality} value={modality}>
                  {WORK_MODALITY_LABEL[modality]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supervisorName">Supervisor name</Label>
              <Input
                id="supervisorName"
                {...register("supervisorName")}
                {...errorProps(
                  "supervisorName",
                  errors.supervisorName?.message as string | undefined
                )}
              />
              <FieldError
                id="supervisorName-error"
                message={errors.supervisorName?.message as string | undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisorContact">Supervisor contact</Label>
              <Input
                id="supervisorContact"
                {...register("supervisorContact")}
                {...errorProps(
                  "supervisorContact",
                  errors.supervisorContact?.message as string | undefined
                )}
              />
              <FieldError
                id="supervisorContact-error"
                message={errors.supervisorContact?.message as string | undefined}
              />
            </div>
          </div>
          {showPositionTitle && (
            <div className="space-y-2">
              <Label htmlFor="positionTitle">Your position title</Label>
              <Input id="positionTitle" {...register("positionTitle")} />
            </div>
          )}
          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register company"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
