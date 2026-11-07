"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";
import { requirementLabel } from "@/lib/utils/requirementLabel";

export type GridRow = {
  studentId: string;
  name: string;
  items: Record<string, { id: string; status: string; uploaded: boolean }>;
};

// Short column heads; the full name is the tooltip and the checkbox's label.
const SHORT: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical",
  PSYCHOLOGICAL_CLEARANCE: "Psych",
  PARENT_CONSENT_UNDERTAKING: "Consent",
  COMPANY_REPLY_FORM: "Reply form",
  DATA_PRIVACY_ORIENTATION: "Privacy",
  INTERNSHIP_ORIENTATION: "Orientation",
  GOVERNMENT_COMPANY_PERMIT: "DTI/SEC",
  WORK_PLAN: "Work plan",
  MOA: "MOA",
  PROOF_OF_CORPORATE_LEGITIMACY: "Legitimacy",
  INTERNSHIP_AGREEMENT: "Agreement",
};

export function ChecklistGrid({ rows, columns }: { rows: GridRow[]; columns: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const uploadedIds = rows.flatMap((r) =>
    Object.values(r.items)
      .filter((i) => i.uploaded && i.status === "PENDING")
      .map((i) => i.id)
  );
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function approve() {
    setPending(true);
    const res = await sendJson("/api/checklist-items/bulk-review", {
      method: "POST",
      body: { itemIds: [...selected] },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const approved = Number(res.body.approved ?? 0);
    const failed = (res.body.failed as { id: string; error: string }[] | undefined) ?? [];
    if (failed.length === 0) toast.success(`Approved ${approved}`);
    else
      toast.warning(
        `Approved ${approved}. ${failed.length} not approved: ${[...new Set(failed.map((f) => f.error))].join("; ")}`
      );
    setSelected(new Set(failed.map((f) => f.id)));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || uploadedIds.length === 0}
          onClick={() => setSelected(new Set(uploadedIds))}
          className="cursor-pointer gap-1.5"
        >
          <CheckSquare className="size-3.5" aria-hidden="true" />
          Select every item marked uploaded ({uploadedIds.length})
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || selected.size === 0}
          onClick={approve}
          className="cursor-pointer gap-1.5"
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {pending ? "Approving..." : `Approve selected (${selected.size})`}
        </Button>
        {selected.size > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setSelected(new Set())}
            className="cursor-pointer"
          >
            Clear
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Checklist status for each intern. Ticked boxes are approved together.
          </caption>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                Intern
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  title={requirementLabel(c)}
                  className="px-2 py-2 text-center font-medium whitespace-nowrap"
                >
                  {SHORT[c] ?? requirementLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                  <Link
                    href={`/students/${r.studentId}/checklist`}
                    prefetch={false}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.name}
                  </Link>
                </th>
                {columns.map((c) => {
                  const item = r.items[c];
                  if (!item) {
                    return (
                      <td key={c} className="px-2 py-2 text-center text-muted-foreground">
                        <span aria-label="Not needed">—</span>
                      </td>
                    );
                  }
                  if (item.status === "APPROVED") {
                    return (
                      <td key={c} className="px-2 py-2 text-center">
                        <CheckCircle2
                          className="mx-auto size-4 text-status-done"
                          aria-label="Approved"
                        />
                      </td>
                    );
                  }
                  const label = `${requirementLabel(c)} for ${r.name}`;
                  return (
                    <td key={c} className="px-2 py-1 text-center">
                      <label className="inline-flex min-h-10 min-w-10 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          disabled={pending || item.status !== "PENDING"}
                          onChange={() => toggle(item.id)}
                          className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                        />
                        <span className="sr-only">{label}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.status === "RETURNED"
                            ? "returned"
                            : item.uploaded
                              ? "uploaded"
                              : "pending"}
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
