"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Blocking: no close button, Escape and outside clicks do nothing. The only ways out are the two answers.
export function PrivacyConsentDialog() {
  const router = useRouter();
  const [pending, setPending] = useState<"agree" | "decline" | null>(null);

  async function answer(agree: boolean) {
    setPending(agree ? "agree" : "decline");
    const res = await sendJson("/api/profile/privacy-consent", { method: "POST", body: { agree } });
    if (!res.ok) {
      setPending(null);
      toast.error(res.error);
      return;
    }
    if (agree) {
      router.refresh();
    } else {
      await signOut({ callbackUrl: "/login" });
    }
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto [&>button:last-child]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Data privacy notice</DialogTitle>
          <DialogDescription>
            Please read this before using IDSMS-CIS. It follows the Data Privacy Act of 2012 (RA
            10173).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-foreground">
          <p>
            Saint Louis University SAMCIS collects your name, student number, email, program,
            internship company, attendance, daily and weekly reports, and the documents you upload.
          </p>
          <p>
            We use them only to monitor your internship: checking requirements, counting hours,
            reviewing reports, and generating your endorsement letter and final report.
          </p>
          <p>
            Only you, your faculty adviser, the department coordinator and system administrators can
            see your records. Records are kept for three years after the semester, then deleted.
          </p>
          <p>
            You may request a copy or correction of your data at any time from your Profile page.
          </p>
          <p>
            Faculty and staff: you agree to use interns&apos; records only for monitoring their
            internship, and not to copy or share them outside IDSMS-CIS.
          </p>
          <p className="text-muted-foreground">
            If you disagree, you will be signed out. The system cannot monitor your internship
            without this data, so please talk to your coordinator.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => void answer(false)}
            className="cursor-pointer"
          >
            {pending === "decline" ? "Signing out..." : "I disagree"}
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void answer(true)}
            className="cursor-pointer"
          >
            {pending === "agree" ? "Saving..." : "I agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
