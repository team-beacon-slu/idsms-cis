"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { OFFLINE_MESSAGE } from "@/lib/utils/sendJson";
import { UploadCloud, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Option = { id: string; label: string };

const selectClass =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";

// Pickers, not ID fields: the coordinator had to paste raw UUIDs before.
export function BulkImportForm({
  classGroups,
  semesters,
  defaultSemesterId,
}: {
  classGroups: Option[];
  semesters: Option[];
  defaultSemesterId?: string;
}) {
  const [classGroupId, setClassGroupId] = useState(
    classGroups.length === 1 ? classGroups[0].id : ""
  );
  const [semesterId, setSemesterId] = useState(defaultSemesterId ?? semesters[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<
    (BulkImportResult & { rowErrors: RowError[]; preview?: boolean }) | null
  >(null);
  // Efficiency item 30: the first submit only checks the file ("N new / M skipped"); the
  // second imports. Changing the file, group or semester checks again.
  const previewed = Boolean(result?.preview);
  const clearPreview = () => setResult((r) => (r?.preview ? null : r));
  const [downloaded, setDownloaded] = useState(false);
  // The temporary passwords live only in this tab (the welcome emails don't carry them):
  // leaving before downloading would mean resetting every new account by hand.
  const unsaved = Boolean(result && !result.preview && result.created > 0 && !downloaded);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

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
    if (!previewed) formData.set("preview", "1");

    const res = await fetch("/api/users/bulk-import", { method: "POST", body: formData }).catch(
      () => null
    );
    setIsSubmitting(false);

    if (!res) {
      toast.error(OFFLINE_MESSAGE);
      return;
    }
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      toast.error(failure.error ?? "Import failed");
      return;
    }

    const body = await res.json();
    setResult(body);
    setDownloaded(false);
    if (!body.preview) toast.success(`Imported ${body.created} of ${body.totalRows} rows`);
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
    setDownloaded(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload class list</CardTitle>
          <CardDescription>
            CSV or Excel. Columns: studentNumber, email, program, requiredHours, and optionally
            classGroup (e.g. BSIT 4A) to file each row into its own section.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="classGroupId">Class group</Label>
                {classGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No class groups yet.{" "}
                    <Link href="/class-groups" className="font-medium text-foreground underline">
                      Create one first
                    </Link>
                    .
                  </p>
                ) : (
                  <select
                    id="classGroupId"
                    value={classGroupId}
                    onChange={(e) => {
                      setClassGroupId(e.target.value);
                      clearPreview();
                    }}
                    required
                    className={selectClass}
                  >
                    <option value="" disabled>
                      Choose a class group
                    </option>
                    {classGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="semesterId">Semester</Label>
                <select
                  id="semesterId"
                  value={semesterId}
                  onChange={(e) => {
                    setSemesterId(e.target.value);
                    clearPreview();
                  }}
                  required
                  className={selectClass}
                >
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
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
              {/* A plain input: the shared Input's w-full beat sr-only and overflowed phones. */}
              <input
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clearPreview();
                }}
                required
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting
                ? previewed
                  ? "Importing..."
                  : "Checking..."
                : previewed
                  ? `Import ${result?.created ?? 0} new ${result?.created === 1 ? "student" : "students"}`
                  : "Check file"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              {result.preview ? "Check: " : "Results: "}
              {result.created} {result.preview ? "new" : "created"}, {result.skipped} skipped
              {result.rowErrors.length > 0 && `, ${result.rowErrors.length} invalid`}
              {result.preview && (
                <span className="block text-sm font-normal text-muted-foreground">
                  Nothing is saved yet. Import to create the accounts.
                </span>
              )}
            </CardTitle>
            {!result.preview && result.created > 0 && (
              <Button
                onClick={downloadCsv}
                variant={downloaded ? "outline" : "default"}
                className="cursor-pointer gap-2"
              >
                <Download className="size-4" aria-hidden="true" />
                {downloaded ? "Download again" : "Download credentials CSV"}
              </Button>
            )}
          </CardHeader>
          {unsaved && (
            <p role="status" className="px-6 text-sm font-medium text-foreground">
              The temporary passwords are shown only on this page. Download the CSV before you
              leave.
            </p>
          )}
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
                          {result.preview && r.status === "created" ? "new" : r.status}
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
                      <TableCell>
                        {Array.isArray(e.issues) &&
                        typeof (e.issues[0] as { message?: unknown })?.message === "string"
                          ? (e.issues[0] as { message: string }).message
                          : "Failed validation"}
                      </TableCell>
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
