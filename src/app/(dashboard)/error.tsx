"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="This page couldn't load"
      description={`Something went wrong on our side or the connection dropped. Try again; if it keeps happening, tell your coordinator${error.digest ? ` (code ${error.digest})` : ""}.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset} className="cursor-pointer">
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Go to dashboard</Link>
          </Button>
        </div>
      }
    />
  );
}
