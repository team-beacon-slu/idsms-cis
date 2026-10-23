import type { Metadata } from "next";
import { LEGAL_UPDATED, TermsBody } from "@/components/legal-content";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight text-brand-900">
        Terms of use
      </h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <TermsBody />
    </>
  );
}
