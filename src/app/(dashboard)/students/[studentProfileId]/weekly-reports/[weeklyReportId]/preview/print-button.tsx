"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Prints only the report iframe, not the dashboard around it.
export function PrintButton({ frameId }: { frameId: string }) {
  function print() {
    const frame = document.getElementById(frameId) as HTMLIFrameElement | null;
    frame?.contentWindow?.print();
  }
  return (
    <Button onClick={print} className="cursor-pointer gap-1.5">
      <Printer className="size-4" aria-hidden="true" />
      Print / Save as PDF
    </Button>
  );
}
