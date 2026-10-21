"use client";

import { useState } from "react";
import { FieldError, errorProps } from "@/components/field-error";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createCompanySchema } from "@/lib/validators/company";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const WORK_MODALITIES = ["ON_SITE", "WORK_FROM_HOME", "HYBRID"] as const;

export function CompanyForm({ showPositionTitle }: { showPositionTitle: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(createCompanySchema) });

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
                  {modality}
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
