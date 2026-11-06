"use client";

import { toast } from "sonner";
import { CalendarPlus, Copy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// The viewer's private .ics link: open it on a phone to subscribe, or paste it into Google or
// Outlook Calendar ("From URL"). Anyone with the link sees this calendar, so it is not shown
// in full.
export function FeedLink({ url }: { url: string }) {
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={webcal} className={buttonVariants({ size: "sm" }) + " cursor-pointer gap-1.5"}>
        <CalendarPlus className="size-3.5" aria-hidden="true" />
        Add to my calendar
      </a>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="cursor-pointer gap-1.5"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied. Keep it private: anyone with it sees your calendar");
          } catch {
            toast.error("Could not copy; long-press Add to my calendar instead");
          }
        }}
      >
        <Copy className="size-3.5" aria-hidden="true" />
        Copy link
      </Button>
    </div>
  );
}
