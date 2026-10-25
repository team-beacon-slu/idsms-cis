"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Workstream L2 — conduct records, automatic deduction items and the ADVISER /
// WWR points tally. Staff issue, revoke and excuse; interns may dispute an item
// that counts, and staff accept (Excuse / Revoke) or keep it with a note.

export interface ConductCardData {
  tally: {
    rows: Array<{ key: string; label: string; count: number; adviser: number; wwr: number }>;
    totals: { adviser: number; wwr: number };
  };
  records: Array<{
    id: string;
    categoryKey: string;
    weight: number;
    date: string;
    reason: string;
    hoursDeducted: number;
    revokedAt: string | null;
    revokeReason: string | null;
  }>;
  items: Array<{
    itemType: string;
    itemKey: string;
    date: string;
    detail: string;
    unjustified: boolean;
    excused: { id: string; reasonCode: string; note: string } | null;
  }>;
  categories: Array<{ key: string; label: string }>; // manual categories staff can issue
  disputes: Array<{
    id: string;
    itemType: string;
    itemKey: string;
    reason: string;
    outcome: string | null; // null while open
    resolutionNote: string | null;
  }>; // newest first
}

const SELECT_CLASS =
  "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-not-allowed";
const REASON_LABEL: Record<string, string> = {
  HTE_ATTESTED_DOCUMENTATION: "HTE-attested documentation",
  BEYOND_INTERN_CONTROL: "Beyond the intern's control",
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

async function send(url: string, body: unknown, ok: string, onDone: () => void) {
  const res = await sendJson(url, { method: "POST", body });
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  toast.success(ok);
  onDone();
  return true;
}

// An inline "reason" step for revoke / excuse, instead of window.confirm.
function InlineReason({
  label,
  submitLabel,
  withReasonCode,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  withReasonCode?: boolean;
  onSubmit: (text: string, reasonCode: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [code, setCode] = useState("BEYOND_INTERN_CONTROL");
  const [pending, setPending] = useState(false);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer"
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        {submitLabel}
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-md border p-3" role="group" aria-label={label}>
      {withReasonCode && (
        <select
          className={SELECT_CLASS}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Reason"
        >
          {Object.entries(REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      )}
      <Textarea
        autoFocus
        rows={2}
        maxLength={500}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        placeholder={withReasonCode ? "Note (documentation is in Google Classroom)" : "Reason"}
        aria-label={`${label} — note`}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          className="cursor-pointer"
          onClick={async () => {
            setPending(true);
            const ok = await onSubmit(text, code);
            setPending(false);
            if (ok) setOpen(false);
          }}
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          className="cursor-pointer"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// The intern's side of a deduction that still counts: the latest dispute and
// what happened to it, with Dispute (intern) or Keep deduction (staff).
function DisputeLine({
  studentProfileId,
  isStaff,
  itemType,
  itemKey,
  what,
  disputes,
  onDone,
}: {
  studentProfileId: string;
  isStaff: boolean;
  itemType: string;
  itemKey: string;
  what: string;
  disputes: ConductCardData["disputes"];
  onDone: () => void;
}) {
  const family = (t: string) => (t.endsWith("_WWR") ? "WWR" : t);
  const latest = disputes.find(
    (d) => family(d.itemType) === family(itemType) && d.itemKey === itemKey
  );
  const open = latest && !latest.outcome ? latest : null;
  // Fragment, not a full-width box: the Dispute button sits at the row's right end.
  return (
    <>
      {open && (
        <p className="w-full text-xs text-amber-800 dark:text-amber-300">
          {isStaff ? "The intern disputes this: " : "You disputed this: "}
          {open.reason}
          {!isStaff && " — waiting for your adviser."}
        </p>
      )}
      {!open && latest?.outcome === "DECLINED" && (
        <p className="w-full text-xs text-muted-foreground">
          Dispute declined: {latest.resolutionNote}
        </p>
      )}
      {open && isStaff && (
        <InlineReason
          label={`Keep ${what} and tell the intern why`}
          submitLabel="Keep deduction"
          onSubmit={(text) =>
            send(
              `/api/deduction-disputes/${open.id}/decline`,
              { note: text },
              "Dispute declined — the intern is notified",
              onDone
            )
          }
        />
      )}
      {!open && !isStaff && (
        <InlineReason
          label={`Dispute ${what}`}
          submitLabel="Dispute"
          onSubmit={(text) =>
            send(
              `/api/students/${studentProfileId}/deductions/disputes`,
              { itemType, itemKey, reason: text },
              "Dispute sent to your adviser",
              onDone
            )
          }
        />
      )}
    </>
  );
}

export function ConductCard({
  studentProfileId,
  isStaff,
  data,
}: {
  studentProfileId: string;
  isStaff: boolean;
  data: ConductCardData;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const label = (key: string) => data.tally.rows.find((r) => r.key === key)?.label ?? key;

  const [form, setForm] = useState({
    categoryKey: data.categories[0]?.key ?? "",
    weight: "1",
    date: "",
    reason: "",
    hoursDeducted: "",
  });
  const [issuing, setIssuing] = useState(false);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setIssuing(true);
    const ok = await send(
      `/api/students/${studentProfileId}/conduct-records`,
      {
        categoryKey: form.categoryKey,
        weight: Number(form.weight),
        date: form.date,
        reason: form.reason,
        ...(form.hoursDeducted !== "" ? { hoursDeducted: Number(form.hoursDeducted) } : {}),
      },
      "Conduct record added — the intern is notified",
      refresh
    );
    setIssuing(false);
    if (ok) setForm((f) => ({ ...f, reason: "", date: "", hoursDeducted: "" }));
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Deduction tally</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 text-right font-medium">Count</th>
              <th className="py-2 pr-3 text-right font-medium">Adviser</th>
              <th className="py-2 text-right font-medium">WWR</th>
            </tr>
          </thead>
          <tbody>
            {data.tally.rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.count}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.adviser ? `−${r.adviser}` : "0"}
                </td>
                <td className="py-2 text-right tabular-nums">{r.wwr ? `−${r.wwr}` : "0"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-3">Total deductions</td>
              <td />
              <td className="py-2 pr-3 text-right tabular-nums">
                {data.tally.totals.adviser ? `−${data.tally.totals.adviser}` : "0"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {data.tally.totals.wwr ? `−${data.tally.totals.wwr}` : "0"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">
          Grade-point deductions per SLU&apos;s deduction matrix. IDSMS reports them; it does not
          compute the final grade.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Conduct records</h3>
        {data.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">None on record.</p>
        ) : (
          <ul className="divide-y">
            {data.records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className={r.revokedAt ? "text-muted-foreground line-through" : ""}>
                  <p className="text-sm font-medium">
                    {label(r.categoryKey)}
                    {r.weight === 2 && " (counts as 2)"} · {fmtDate(r.date)}
                    {r.hoursDeducted > 0 && ` · −${r.hoursDeducted} hrs`}
                  </p>
                  <p className="text-sm">{r.reason}</p>
                </div>
                {!r.revokedAt && (
                  <DisputeLine
                    studentProfileId={studentProfileId}
                    isStaff={isStaff}
                    itemType="CONDUCT"
                    itemKey={r.id}
                    what={`${label(r.categoryKey)} of ${fmtDate(r.date)}`}
                    disputes={data.disputes}
                    onDone={refresh}
                  />
                )}
                {r.revokedAt ? (
                  <p className="w-full text-xs text-muted-foreground">Revoked: {r.revokeReason}</p>
                ) : (
                  isStaff && (
                    <InlineReason
                      label={`Revoke ${label(r.categoryKey)} of ${fmtDate(r.date)}`}
                      submitLabel="Revoke"
                      onSubmit={(text) =>
                        send(
                          `/api/conduct-records/${r.id}/revoke`,
                          { reason: text },
                          "Record revoked",
                          refresh
                        )
                      }
                    />
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Counted automatically</h3>
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No late or missing reports, and no unsupported undertime.
          </p>
        ) : (
          <ul className="divide-y">
            {data.items.map((i) => (
              <li
                key={`${i.itemType}-${i.itemKey}`}
                className="flex flex-wrap items-start justify-between gap-2 py-2"
              >
                <div>
                  <p className="text-sm">
                    {i.detail}
                    {i.unjustified && !i.excused && (
                      <span className="text-xs text-red-700"> · no valid reason (+2)</span>
                    )}
                  </p>
                  {i.excused && (
                    <p className="text-xs text-green-700">
                      Excused — {REASON_LABEL[i.excused.reasonCode] ?? i.excused.reasonCode}:{" "}
                      {i.excused.note}
                    </p>
                  )}
                </div>
                {!i.excused && (
                  <DisputeLine
                    studentProfileId={studentProfileId}
                    isStaff={isStaff}
                    itemType={i.itemType}
                    itemKey={i.itemKey}
                    what={i.detail}
                    disputes={data.disputes}
                    onDone={refresh}
                  />
                )}
                {isStaff &&
                  (i.excused ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      aria-label={`Withdraw the excuse for ${i.detail}`}
                      onClick={() =>
                        send(
                          `/api/deduction-exceptions/${i.excused!.id}/withdraw`,
                          {},
                          "Excuse withdrawn",
                          refresh
                        )
                      }
                    >
                      Withdraw excuse
                    </Button>
                  ) : (
                    <InlineReason
                      label={`Excuse ${i.detail}`}
                      submitLabel="Excuse"
                      withReasonCode
                      onSubmit={(text, code) =>
                        send(
                          `/api/students/${studentProfileId}/deductions/excuse`,
                          {
                            itemType: i.itemType,
                            itemKey: i.itemKey,
                            reasonCode: code,
                            note: text,
                          },
                          "Item excused",
                          refresh
                        )
                      }
                    />
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isStaff && data.categories.length > 0 && (
        <form onSubmit={issue} className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-foreground">Add a conduct record</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="cr-category">Category</Label>
              <select
                id="cr-category"
                className={SELECT_CLASS}
                value={form.categoryKey}
                onChange={(e) => setForm({ ...form, categoryKey: e.target.value })}
              >
                {data.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-weight">Counts as</Label>
              <select
                id="cr-weight"
                className={SELECT_CLASS}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              >
                <option value="1">1</option>
                <option value="2">2 (e.g. &quot;First and Final&quot; warning)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-date">Date</Label>
              <Input
                id="cr-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-hours">Hours deducted (optional)</Label>
              <Input
                id="cr-hours"
                type="number"
                min={0}
                max={40}
                step={0.5}
                placeholder="Default"
                value={form.hoursDeducted}
                onChange={(e) => setForm({ ...form, hoursDeducted: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cr-reason">Reason</Label>
            <Textarea
              id="cr-reason"
              rows={2}
              required
              minLength={10}
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={issuing} className="cursor-pointer">
            {issuing ? "Saving…" : "Add record"}
          </Button>
        </form>
      )}
    </div>
  );
}
