import { BrandMark } from "@/components/brand-mark";
import { CoastScene } from "@/components/coast-scene";

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

// The sign-in frame: the painted coast fills the screen (the same scene as the
// dashboard), the product and what it does on a glass panel, the form beside it. The
// right of the screen stays open for the headland and its turning light.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh">
      <CoastScene />
      <div className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 lg:justify-start lg:px-16 xl:px-24">
        <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="hidden rounded-3xl glass-strong p-10 lg:block xl:p-12">
            <Wordmark />
            <div className="mt-10 space-y-3">
              <p className="max-w-lg font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance text-brand-900 dark:text-white">
                Every internship week, in one place.
              </p>
              <p className="max-w-md text-base text-muted-foreground">
                Document submission and internship monitoring for SAMCIS IT, CS and MMA interns,
                their faculty advisers and coordinators.
              </p>
            </div>
            <ul className="mt-8 max-w-md space-y-4 border-l-2 border-[#5fbf8f] pl-5">
              {FEATURES.map(({ title, description }) => (
                <li key={title}>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-sm text-muted-foreground">
              IT · CS · MMA internships · Team BEACON
            </p>
          </section>

          <div className="mx-auto w-full max-w-sm lg:max-w-none">
            <div className="mb-6 flex justify-center rounded-2xl glass-strong px-4 py-3 lg:hidden">
              <Wordmark />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
