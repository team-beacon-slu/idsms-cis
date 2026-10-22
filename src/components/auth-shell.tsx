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

// The sign-in frame: one field of the BEACON navy carrying the product and what it does
// (desktop), the form on the page ground. The logo and the words carry it.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex xl:p-16">
        <Wordmark onNavy />

        <div className="space-y-10">
          <div className="space-y-3">
            <h1 className="max-w-lg text-4xl leading-[1.05] font-bold tracking-tight text-balance text-white xl:text-5xl">
              Internship documents and hours, tracked end to end.
            </h1>
            <p className="max-w-md text-base text-white/80">
              Document submission and internship monitoring for SAMCIS IT, CS and MMA interns, their
              faculty advisers and coordinators.
            </p>
          </div>
          <ul className="max-w-md space-y-5 border-l-2 border-[#5fbf8f] pl-5">
            {FEATURES.map(({ title, description }) => (
              <li key={title}>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-sm text-white/70">{description}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-white/70">IT · CS · MMA internships · Team BEACON</p>
      </div>

      <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-8">
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
