"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { PRIVACY_KEY_POINTS, TERMS_KEY_POINTS } from "@/components/legal-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Blocking: no close button, Escape and outside clicks do nothing. The only ways out are the two
// answers, and agreeing needs the box ticked.
export function PrivacyConsentDialog() {
  const router = useRouter();
  const [pending, setPending] = useState<"agree" | "decline" | null>(null);
  const [read, setRead] = useState(false);

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
          <DialogTitle>Privacy notice and terms of use</DialogTitle>
          <DialogDescription>
            Please read these before using IDSMS-CIS. They follow the Data Privacy Act of 2012 (RA
            10173).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-foreground">
          <div>
            <p className="font-medium">Your data</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {PRIVACY_KEY_POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Using IDSMS</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {TERMS_KEY_POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <p>
            Read the full{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="font-medium text-primary underline underline-offset-2"
            >
              privacy notice
            </a>{" "}
            and{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener"
              className="font-medium text-primary underline underline-offset-2"
            >
              terms of use
            </a>{" "}
            (opens in a new tab).
          </p>
          {/* An explicit tick, not just a button: the agreement is informed and provable (NPC consent standard). */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-brand-600"
            />
            <span>I have read and agree to the privacy notice and the terms of use.</span>
          </label>
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
            disabled={pending !== null || !read}
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
