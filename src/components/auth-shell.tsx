import { ShieldCheck, Clock, CalendarRange } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Compliance gating",
    description: "Endorsement letters stay locked until every pre-deployment document is approved.",
  },
  {
    icon: Clock,
    title: "Automated tracking",
    description: "Real-time hour computation and projected completion dates, no spreadsheets.",
  },
  {
    icon: CalendarRange,
    title: "Unified calendar",
    description: "Deadlines, holidays, and OJT milestones in one role-aware view.",
  },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />
        <span className="relative text-lg font-semibold tracking-tight">IDSMS-CIS</span>

        <div className="relative space-y-10">
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight">
              Internship deployment, tracked end to end.
            </h1>
            <p className="max-w-sm text-sm text-sidebar-foreground/70">
              The centralized platform for SAMCIS internship compliance, hours, and reviews.
            </p>
          </div>
          <ul className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-sidebar-foreground/60">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          Saint Louis University &mdash; SAMCIS
        </p>
      </div>

      <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <span className="mb-6 block text-center text-lg font-semibold tracking-tight text-foreground lg:hidden">
            IDSMS-CIS
          </span>
          {children}
        </div>
      </div>
    </div>
  );
}
