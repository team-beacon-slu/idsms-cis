"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PROGRAMS = ["BSIT", "BSCS", "BMMA"] as const;

export function MoaForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<"link" | "file">("link");
  const [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [programsCovered, setProgramsCovered] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleProgram(program: string) {
    setProgramsCovered((prev) =>
      prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (programsCovered.length === 0) {
      toast.error("Select at least one program");
      return;
    }

    setIsSubmitting(true);
    let res: Response;

    if (sourceType === "file") {
      if (!file) {
        toast.error("Choose a file first");
        setIsSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.set("file", file);
      formData.set("validFrom", validFrom);
      formData.set("validTo", validTo);
      programsCovered.forEach((p) => formData.append("programsCovered", p));
      res = await fetch(`/api/companies/${companyId}/moa`, { method: "POST", body: formData });
    } else {
      res = await fetch(`/api/companies/${companyId}/moa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentUrl, validFrom, validTo, programsCovered }),
      });
    }

    setIsSubmitting(false);

    if (!res.ok) {
      toast.error("Failed to create MOA record");
      return;
    }

    toast.success("MOA record created");
    router.push(`/companies/${companyId}`);
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Add MOA record</CardTitle>
        <CardDescription>Upload a PDF or link a Google Drive document (FR-MOA-03).</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={sourceType === "link" ? "default" : "outline"}
              size="sm"
              onClick={() => setSourceType("link")}
            >
              Link
            </Button>
            <Button
              type="button"
              variant={sourceType === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setSourceType("file")}
            >
              Upload file
            </Button>
          </div>

          {sourceType === "link" ? (
            <div className="space-y-2">
              <Label htmlFor="documentUrl">Google Drive link</Label>
              <Input
                id="documentUrl"
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="file">MOA PDF</Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="validFrom">Valid from</Label>
            <Input
              id="validFrom"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="validTo">Valid to</Label>
            <Input
              id="validTo"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              required
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Programs covered</legend>
            <div className="flex gap-4">
              {PROGRAMS.map((program) => (
                <label key={program} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={programsCovered.includes(program)}
                    onChange={() => toggleProgram(program)}
                  />
                  {program}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Create MOA record"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
