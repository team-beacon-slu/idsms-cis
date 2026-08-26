"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UploadCloud, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BulkImportResult } from "@/types/user";

interface RowError {
  rowNumber: number;
  issues: unknown;
}

export function BulkImportForm() {
  const [classGroupId, setClassGroupId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<(BulkImportResult & { rowErrors: RowError[] }) | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a file first");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("classGroupId", classGroupId);
    formData.set("semesterId", semesterId);

    const res = await fetch("/api/users/bulk-import", { method: "POST", body: formData });
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error("Import failed");
      return;
    }

    const body = await res.json();
    setResult(body);
    toast.success(`Imported ${body.created} of ${body.totalRows} rows`);
  }

  function downloadCsv() {
    if (!result) return;
    const header = "studentNumber,email,temporaryPassword\n";
    const rows = result.results
      .filter((r) => r.status === "created")
      .map((r) => `${r.studentNumber},${r.email},${r.temporaryPassword ?? ""}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload class list</CardTitle>
          <CardDescription>
            CSV or Excel. Columns: studentNumber, email, program, requiredHours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="classGroupId">Class group ID</Label>
                <Input
                  id="classGroupId"
                  value={classGroupId}
                  onChange={(e) => setClassGroupId(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="semesterId">Semester ID</Label>
                <Input
                  id="semesterId"
                  value={semesterId}
                  onChange={(e) => setSemesterId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <label
                htmlFor="file"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input px-6 py-8 text-center transition-colors duration-200 hover:border-primary/50 hover:bg-accent/50"
                )}
              >
                {file ? (
                  <>
                    <FileText className="size-6 text-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Click to choose a different file
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">
                      Click to select a file, or drag it here
                    </span>
                    <span className="text-xs text-muted-foreground">.csv, .xlsx, or .xls</span>
                  </>
                )}
              </label>
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Importing..." : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              Results: {result.created} created, {result.skipped} skipped
              {result.rowErrors.length > 0 && `, ${result.rowErrors.length} invalid`}
            </CardTitle>
            {result.created > 0 && (
              <Button onClick={downloadCsv} variant="outline" className="cursor-pointer gap-2">
                <Download className="size-4" aria-hidden="true" />
                Download credentials CSV
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Student number</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell>{r.studentNumber}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "created" ? "outline" : "destructive"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {result.rowErrors.map((e) => (
                    <TableRow key={`error-${e.rowNumber}`}>
                      <TableCell>{e.rowNumber}</TableCell>
                      <TableCell colSpan={2}>Invalid row data</TableCell>
                      <TableCell>
                        <Badge variant="destructive">invalid</Badge>
                      </TableCell>
                      <TableCell>Failed validation</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
