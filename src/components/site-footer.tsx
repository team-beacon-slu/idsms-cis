import Link from "next/link";
import { Globe, Library, LogIn, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

const SLU_LINKS = [
  { href: "https://www.slu.edu.ph/", label: "SLU website", icon: Globe },
  { href: "https://portal.slu.edu.ph/", label: "SLU Portal", icon: LogIn },
  {
    href: "http://webopac.slu.edu.ph/district/servlet/presentlistsitesform.do?districtMode=true",
    label: "Library",
    icon: Library,
  },
  {
    href: "https://dataprotection.slu.edu.ph/",
    label: "Data Protection Office",
    icon: ShieldCheck,
  },
];

// Help lives behind sign-in, so the public legal pages leave it out.
export function SiteFooter({
  signedIn,
  className,
  // Matches the column of the page above it: the dashboard canvas by default.
  containerClassName = "max-w-[1480px] px-4 sm:px-6 md:px-8 xl:px-12",
}: {
  signedIn: boolean;
  className?: string;
  containerClassName?: string;
}) {
  const links = [
    ...(signedIn ? [{ href: "/help", label: "Help" }] : []),
    { href: "/privacy", label: "Privacy notice" },
    { href: "/terms", label: "Terms of use" },
  ];

  return (
    <footer className={cn("print:hidden", className)}>
      <div className={cn("mx-auto w-full", containerClassName)}>
        <div className="flex flex-wrap items-center justify-between gap-5 border-t border-border/70 py-8">
          <div className="flex items-center gap-3">
            <BrandMark className="size-10 shrink-0" />
            <div>
              <p className="font-display text-base font-bold tracking-tight text-foreground">
                IDSMS-CIS
              </p>
              <p className="text-sm text-muted-foreground">
                Internship monitoring for Saint Louis University SAMCIS.
              </p>
            </div>
          </div>
          <ul aria-label="Saint Louis University sites" className="flex flex-wrap gap-2">
            {SLU_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card/70 px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Footer" className="border-t border-border/70 py-5">
          <ul className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm">
            {links.map(({ href, label }, i) => (
              <li key={href} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-muted-foreground/60">
                    ·
                  </span>
                )}
                <Link
                  href={href}
                  className="rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Saint Louis University · School of Accountancy, Management,
          Computing and Information Studies · Built by Team BEACON
        </p>
      </div>
    </footer>
  );
}
