"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// en-CA yields YYYY-MM-DD; avoids pulling the xlsx-backed excelExport into the client bundle.
const manilaDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function DataRequestCard({
  open,
  lastFulfilledAt,
}: {
  open: { dueAt: string } | null;
  lastFulfilledAt: string | null;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function requestData() {
    setIsPending(true);
    try {
      const res = await fetch("/api/data-requests", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not send your request");
        // 409: the card is stale (a request is already open); show the real state.
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success(`Request sent — due ${manilaDate(body.dueAt)}`);
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          You can ask for a copy of the personal data IDSMS holds about you. The Super Admin has 15
          days to prepare it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open ? (
          <p className="text-sm font-medium text-foreground">
            Request open — due {manilaDate(open.dueAt)}
          </p>
        ) : (
          <Button onClick={requestData} disabled={isPending} className="cursor-pointer">
            {isPending ? "Sending..." : "Request my data"}
          </Button>
        )}
        {lastFulfilledAt && (
          <p className="text-sm text-muted-foreground">
            Last request completed {manilaDate(lastFulfilledAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
