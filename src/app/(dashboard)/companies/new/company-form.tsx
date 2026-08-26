"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createCompanySchema } from "@/lib/validators/company";
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
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error("Failed to register company");
      return;
    }

    const company = await res.json();
    toast.success("Company registered");
    router.push(`/companies/${company.id}`);
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Register a company</CardTitle>
        <CardDescription>
          FR-MOA-01: any student or staff member can register a host company.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message as string}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...register("address")} />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message as string}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="workModality">Work modality</Label>
            <select
              id="workModality"
              {...register("workModality")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {WORK_MODALITIES.map((modality) => (
                <option key={modality} value={modality}>
                  {modality}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supervisorName">Supervisor name</Label>
            <Input id="supervisorName" {...register("supervisorName")} />
            {errors.supervisorName && (
              <p className="text-sm text-destructive">{errors.supervisorName.message as string}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="supervisorContact">Supervisor contact</Label>
            <Input id="supervisorContact" {...register("supervisorContact")} />
            {errors.supervisorContact && (
              <p className="text-sm text-destructive">
                {errors.supervisorContact.message as string}
              </p>
            )}
          </div>
          {showPositionTitle && (
            <div className="space-y-2">
              <Label htmlFor="positionTitle">Your position title</Label>
              <Input id="positionTitle" {...register("positionTitle")} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register company"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
