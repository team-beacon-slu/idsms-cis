import type { Metadata } from "next";
import { LEGAL_UPDATED, PrivacyNoticeBody } from "@/components/legal-content";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight text-brand-900">
        Data privacy notice
      </h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <PrivacyNoticeBody />
    </>
  );
}
