import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";

// Public reading pages (privacy notice, terms): readable before signing in, so people
// can check what they are agreeing to.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-backdrop min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
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
          <Link href="/privacy" className="text-brand-700 underline-offset-2 hover:underline">
            Privacy notice
          </Link>
          <Link href="/terms" className="text-brand-700 underline-offset-2 hover:underline">
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
