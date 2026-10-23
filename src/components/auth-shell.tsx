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

// The page's one picture: the BEACON lighthouse drawn large, its beam crossing the navy field.
function Lighthouse() {
  return (
    <svg
      viewBox="0 0 400 520"
      aria-hidden="true"
      className="pointer-events-none absolute -right-44 bottom-0 h-[72%] max-h-[620px] opacity-90 xl:-right-36"
    >
      <path d="M200 112 440 40v150z" fill="#8fb0d3" opacity=".14" />
      <path d="M168 92 200 64l32 28z" fill="#dfe8f2" opacity=".55" />
      <rect x="176" y="92" width="48" height="36" rx="6" fill="#5fbf8f" />
      <rect x="164" y="128" width="72" height="12" rx="4" fill="#dfe8f2" opacity=".55" />
      <path d="M174 140h52l20 340h-92z" fill="#dfe8f2" opacity=".22" />
      <path d="M166 230h68l3 26h-74zM159 340h82l3 26h-88z" fill="#ffffff" opacity=".28" />
      <rect x="100" y="480" width="200" height="16" rx="8" fill="#dfe8f2" opacity=".3" />
    </svg>
  );
}

// The sign-in frame: one field of the BEACON navy carrying the product and what it does
// (desktop), the form on the page ground. The logo and the words carry it.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 beacon-band text-white lg:flex xl:p-16">
        <span aria-hidden="true" className="beacon-beam" />
        <Lighthouse />
        <div className="relative">
          <Wordmark onNavy />
        </div>

        <div className="relative space-y-10">
          <div className="space-y-3">
            <p className="max-w-lg font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance text-white">
              Every internship week, in one place.
            </p>
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

        <p className="relative text-sm text-white/70">IT · CS · MMA internships · Team BEACON</p>
      </div>

      <div className="app-backdrop flex min-h-dvh items-center justify-center p-4 sm:p-8">
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
