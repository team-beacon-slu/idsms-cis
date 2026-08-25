"use client";

import { useState } from "react";
import { toast } from "sonner";
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
          <CardTitle>Bulk import students</CardTitle>
          <CardDescription>
            Upload the official SLU class list (CSV or Excel). Columns: studentNumber, email,
            program, requiredHours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
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
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Importing..." : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Results: {result.created} created, {result.skipped} skipped
              {result.rowErrors.length > 0 && `, ${result.rowErrors.length} invalid`}
            </CardTitle>
            {result.created > 0 && <Button onClick={downloadCsv}>Download credentials CSV</Button>}
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
