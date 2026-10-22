import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { Download, ScrollText } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import {
  AUDIT_PAGE_SIZE,
  auditLogFilterSchema,
  queryAuditLogs,
} from "@/lib/services/auditLogQuery";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const stampFmt = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const FILTER_KEYS = ["action", "entityType", "email", "from", "to"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// LOGIN_SUCCESS -> Login success: the codes stay in the export, people read words.
function humanizeAction(action: string): string {
  const words = action
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\bdsar\b/, "DSAR");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function detailText(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  if (user.role !== Role.SUPER_ADMIN) redirect("/");

  const raw = await searchParams;
  // Blank form fields arrive as "" and mean "not filtered".
  const input: Partial<Record<FilterKey | "page", string>> = {};
  for (const k of [...FILTER_KEYS, "page" as const]) {
    const v = Array.isArray(raw[k]) ? raw[k][0] : raw[k];
    if (v) input[k] = v;
  }
  const parsed = auditLogFilterSchema.safeParse(input);
  const filter = parsed.success ? parsed.data : auditLogFilterSchema.parse({});
  const active: Partial<Record<FilterKey, string>> = parsed.success ? input : {};
  const { rows, total } = await queryAuditLogs(filter);

  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = active[k];
      if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  const exportQuery = qs();
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only record of security and administrative events. Times are Manila time.
          </p>
        </div>
        <Button asChild variant="outline" className="cursor-pointer">
          <a
            href={"/api/audit-logs/export" + (exportQuery ? "?" + exportQuery : "")}
            className="gap-2"
          >
            <Download className="size-4" aria-hidden="true" />
            Export to Excel
          </a>
        </Button>
      </div>

      <form
        method="get"
        action="/audit-log"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="al-action">Action</Label>
          <Input id="al-action" name="action" maxLength={80} defaultValue={active.action ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-entity">Entity type</Label>
          <Input
            id="al-entity"
            name="entityType"
            maxLength={80}
            defaultValue={active.entityType ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-email">User email</Label>
          <Input id="al-email" name="email" maxLength={254} defaultValue={active.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-from">From</Label>
          <Input id="al-from" name="from" type="date" defaultValue={active.from ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-to">To</Label>
          <Input id="al-to" name="to" type="date" defaultValue={active.to ?? ""} />
        </div>
        <Button type="submit" className="cursor-pointer">
          Apply filters
        </Button>
      </form>
      {!parsed.success && (
        <p role="alert" className="text-sm text-destructive">
          Those filters were not valid, so they were ignored.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No matching entries"
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <caption className="sr-only">Audit log entries, newest first</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User email</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity type</TableHead>
                <TableHead>Entity id</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {stampFmt.format(r.timestamp)}
                  </TableCell>
                  <TableCell>{r.email ?? "—"}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap text-foreground">
                    {humanizeAction(r.action)}
                  </TableCell>
                  <TableCell>{r.entityType}</TableCell>
                  <TableCell
                    className="font-mono text-xs whitespace-nowrap"
                    title={r.entityId ?? undefined}
                  >
                    {r.entityId ? `${r.entityId.slice(0, 8)}…` : "—"}
                  </TableCell>
                  <TableCell>{r.ipAddress ?? "—"}</TableCell>
                  <TableCell
                    className="max-w-xs truncate font-mono text-xs"
                    title={detailText(r.detail) || undefined}
                  >
                    {detailText(r.detail) || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Audit log pages" className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {filter.page} of {pageCount} · {total} entries
        </span>
        <div className="flex gap-2">
          {filter.page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={"/audit-log?" + qs({ page: String(filter.page - 1) })} rel="prev">
                Previous
              </Link>
            </Button>
          )}
          {filter.page < pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={"/audit-log?" + qs({ page: String(filter.page + 1) })} rel="next">
                Next
              </Link>
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}
