import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileText, Lock } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { StatusBadge } from "@/components/status-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroStills } from "./hero-stills";

export const metadata: Metadata = {
  title: "About",
  description:
    "IDSMS-CIS keeps every SAMCIS internship week in one place, from the first document to the final report.",
};

// One stop per step of an internship. Behind each section is its still from the Blender
// take (data-stop = still index; STILLS in scripts/blender/build-beacon.py): the
// headland, the door, the bands, the gallery, the dome lifting, the diploma.
// Each card shows the part of IDSMS it is about, with example figures.
const STOPS = [
  {
    id: "checklist",
    title: "Documents first, then the company.",
    body: "Your adviser checks each pre-deployment document. Endorsement letters stay locked until every one is approved.",
    example: <ChecklistExample />,
  },
  {
    id: "weekly-reports",
    title: "One report a week, reviewed.",
    body: "Interns log each day and submit the week. Advisers approve it or return it with a note to fix.",
    example: <WeeksExample />,
  },
  {
    id: "hours",
    title: "Hours that add themselves up.",
    body: "Confirmed hours grow as reports are approved, with a projected finish date always in view.",
    example: <HoursExample />,
  },
  {
    id: "final-report",
    title: "The final report, from the record.",
    body: "The weeks you already filed become the final report, ready to download as a PDF.",
    example: <ReportExample />,
  },
];

export default function AboutPage() {
  return (
    <div className="relative isolate">
      <HeroStills />
      <header className="sticky top-4 z-10 mx-4 mt-4 flex items-center justify-between rounded-2xl glass px-4 py-3 sm:mx-auto sm:max-w-6xl sm:px-6">
        <Link
          href="/about"
          className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden"
        >
          <BrandMark className="size-9" />
          <span className="font-display text-[15px] font-bold tracking-tight text-brand-900">
            IDSMS-CIS
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-brand-900 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            labelClassName="sr-only"
          />
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Phones: the portrait stills keep the tower centred, so text sits low. */}
        <section
          data-stop="0"
          className="flex min-h-[calc(100dvh-5rem)] items-end py-10 sm:items-center sm:py-16"
        >
          <div className="max-w-2xl rounded-3xl glass p-6 sm:p-10">
            <h1 className="font-display text-[1.9rem] leading-tight font-bold tracking-tight text-balance text-brand-900 sm:text-6xl">
              Every internship week, in one place.
            </h1>
            <p className="mt-5 max-w-[60ch] text-lg text-foreground">
              For SAMCIS IT, CS and MMA interns, their advisers and coordinators.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/login">Sign in</Link>
            </Button>
            {/* Who it is for, kept small: Team BEACON built it; SLU did not. */}
            <p className="mt-8 flex items-center gap-2.5 text-sm text-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element -- a 5 KB static seal */}
              <img src="/about/slu-seal.webp" alt="" width={28} height={28} className="size-7" />
              For SAMCIS · Saint Louis University, Baguio City
            </p>
          </div>
        </section>

        {STOPS.map((stop, i) => (
          <section
            key={stop.id}
            aria-labelledby={stop.id}
            data-stop={i + 1}
            className="flex min-h-dvh items-end py-10 sm:min-h-[120dvh] sm:items-center sm:py-16"
          >
            <div className="w-full max-w-lg rounded-3xl glass p-6 sm:p-8">
              <h2
                id={stop.id}
                className="font-display text-3xl font-bold tracking-tight text-balance text-brand-900 sm:text-5xl"
              >
                {stop.title}
              </h2>
              <p className="mt-4 text-lg text-foreground">{stop.body}</p>
              <div className="mt-6 rounded-2xl bg-background/70 p-4 text-sm">{stop.example}</div>
            </div>
          </section>
        ))}

        <section
          aria-labelledby="start"
          data-stop="5"
          className="flex min-h-[70dvh] items-end py-10 sm:items-center sm:py-16"
        >
          <div className="rounded-3xl glass p-6 sm:p-10">
            <h2
              id="start"
              className="font-display text-3xl font-bold tracking-tight text-brand-900 sm:text-5xl"
            >
              Start your week.
            </h2>
            <Button asChild size="lg" className="mt-6">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter signedIn={false} containerClassName="max-w-6xl px-4 sm:px-6" />
    </div>
  );
}

function ChecklistExample() {
  const rows = [
    ["Memorandum of agreement", true],
    ["Parent's consent", true],
    ["Medical certificate", false],
  ] as const;
  return (
    <ul className="space-y-2">
      {rows.map(([name, done]) => (
        <li key={name} className="flex items-center justify-between gap-3">
          <span>{name}</span>
          <span className={done ? "text-mint-900" : "text-muted-foreground"}>
            {done ? <Check className="inline size-4" aria-label="Approved" /> : "Waiting"}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-2 border-t pt-2 text-muted-foreground">
        <Lock className="size-4" aria-hidden="true" /> Endorsement letter is ready once all are
        approved
      </li>
    </ul>
  );
}

function WeeksExample() {
  // The same status chips interns see in the app.
  const weeks = [
    ["Week of Sep 28", "APPROVED"],
    ["Week of Oct 5", "APPROVED"],
    ["Week of Oct 12", "RETURNED"],
    ["Week of Oct 19", "SUBMITTED"],
  ] as const;
  return (
    <ul className="space-y-2">
      {weeks.map(([week, status]) => (
        <li key={week} className="flex items-center justify-between gap-3">
          <span>{week}</span>
          <StatusBadge status={status} />
        </li>
      ))}
    </ul>
  );
}

function HoursExample() {
  return (
    <div>
      <p className="flex items-baseline justify-between">
        <span className="font-display text-2xl font-semibold tabular-nums">312</span>
        <span className="text-muted-foreground tabular-nums">of 486 hours</span>
      </p>
      <div
        role="img"
        aria-label="312 of 486 hours"
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-[64%] rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-muted-foreground">Projected finish: Dec 11</p>
    </div>
  );
}

function ReportExample() {
  return (
    <p className="flex items-center gap-3">
      <FileText className="size-8 shrink-0 text-primary" aria-hidden="true" />
      <span>
        <span className="block font-medium">Final report.pdf</span>
        <span className="text-muted-foreground">Cover, 14 weekly reports, hours summary</span>
      </span>
    </p>
  );
}
