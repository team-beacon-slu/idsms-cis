import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { CoastScene } from "@/components/coast-scene";

// Public reading pages (privacy notice, terms): readable before signing in, so people
// can check what they are agreeing to.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh">
      {/* The painted coast behind; every text block sits on glass to stay readable. */}
      <CoastScene />
      <header className="mx-auto mt-4 mb-6 flex max-w-3xl items-center justify-between rounded-2xl glass px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <BrandMark className="size-9" />
          <span className="font-display text-[15px] font-bold tracking-tight text-brand-900">
            IDSMS-CIS
          </span>
        </Link>
        <nav aria-label="Legal" className="flex gap-4 text-sm">
          <Link
            href="/privacy"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Privacy notice
          </Link>
          <Link
            href="/terms"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Terms of use
          </Link>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <article className="rounded-3xl glass p-6 sm:p-10">{children}</article>
      </main>
      <SiteFooter signedIn={false} containerClassName="max-w-3xl px-4 sm:px-6" />
    </div>
  );
}
