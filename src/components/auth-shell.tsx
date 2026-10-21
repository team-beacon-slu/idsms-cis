import { BrandMark } from "@/components/brand-mark";

const FEATURES = [
  {
    title: "Compliance gating",
    description: "Endorsement letters stay locked until every pre-deployment document is approved.",
  },
  {
    title: "Automated tracking",
    description: "Hours confirmed as reports are approved, with a projected finish date.",
  },
  {
    title: "Unified calendar",
    description: "Deadlines, holidays and OJT milestones in one role-aware view.",
  },
];

function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <BrandMark className="size-10" />
      <span className="leading-tight">
        <span className="block text-lg font-semibold tracking-tight text-foreground">
          IDSMS-CIS
        </span>
        <span className="block text-sm text-muted-foreground">Internship monitoring</span>
      </span>
    </span>
  );
}

// The sign-in frame: the product and what it does on the left (desktop), the form on the
// right. No ornament: the logo and the words carry it.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r bg-sidebar p-12 lg:flex">
        <Wordmark />

        <div className="space-y-10">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
              Internship documents and hours, tracked end to end.
            </h1>
            <p className="max-w-md text-base text-foreground/80">
              Document submission and internship monitoring for SAMCIS IT, CS and MMA interns, their
              faculty advisers and coordinators.
            </p>
          </div>
          <ul className="max-w-md space-y-5">
            {FEATURES.map(({ title, description }) => (
              <li key={title}>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">Saint Louis University · SAMCIS</p>
      </div>

      <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
