import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

function Wordmark({ onNavy = false }: { onNavy?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className={onNavy ? "rounded-xl bg-white p-1.5" : undefined}>
        <BrandMark className="size-10" />
      </span>
      <span className="leading-tight">
        <span
          className={`block text-xl font-bold tracking-tight ${onNavy ? "text-white" : "text-brand-900"}`}
        >
          IDSMS-CIS
        </span>
        <span className={`block text-sm ${onNavy ? "text-white/75" : "text-muted-foreground"}`}>
          SAMCIS · Saint Louis University
        </span>
      </span>
    </span>
  );
}

// The sign-in frame: the logo and the form, centred on a plain page (the adviser asked
// for "the simpler the better").
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh">
      {/* The way back to the public landing page for anyone who is not signed in yet. */}
      <Link
        href="/about"
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-xl glass-strong px-3 py-2 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden sm:top-6 sm:left-6 dark:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Home
      </Link>
      <div className="flex min-h-dvh items-center-safe justify-center px-4 pt-20 pb-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center rounded-2xl glass-strong px-4 py-3">
            <Wordmark />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
