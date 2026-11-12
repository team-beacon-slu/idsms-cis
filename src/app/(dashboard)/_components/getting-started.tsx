"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// NFR-USA-02: a short first-visit tour on the home page, the first things each role does.
// Dismissed per browser; Help can show it again. Hidden until mounted, so it never flashes
// for someone who already closed it.
export const TOUR_KEY = "idsms-getting-started-dismissed";

type Step = { label: string; detail: string; href: string };

const own = (id: string | undefined, path: string) => (id ? `/students/${id}${path}` : "/");

export function stepsFor(role: string, studentProfileId?: string): Step[] {
  switch (role) {
    case "STUDENT_INTERN":
      return [
        {
          label: "Finish your checklist",
          detail:
            "Upload each requirement to Classroom and mark it uploaded; your adviser approves it.",
          href: own(studentProfileId, "/checklist"),
        },
        {
          label: "Send your work plan",
          detail: "Your tasks, then your work schedule; your coordinator approves it.",
          href: own(studentProfileId, "/work-plan"),
        },
        {
          label: "Write your weekly report",
          detail: "Times fill in from your schedule; list your work each day, submit by Tuesday.",
          href: own(studentProfileId, "/weekly-reports"),
        },
        {
          // The faculty adviser, 12 Nov: the calendar is optional; this step is not.
          label: "Upload the signed report to Google Classroom",
          detail: "Download the PDF, have your supervisor sign it, upload it under its WWR name.",
          href: own(studentProfileId, "/weekly-reports"),
        },
      ];
    case "FACULTY_ADVISER":
      return [
        {
          label: "Open your review queue",
          detail: "Approve weeks with nothing flagged in one go.",
          href: "/review-queue",
        },
        {
          label: "Check uploads",
          detail: "Approve checklist requirements for your class groups.",
          href: "/my-students/checklist",
        },
        {
          label: "See each intern",
          detail: "Hours, reports and attendance notes.",
          href: "/my-students",
        },
      ];
    case "DEPARTMENT_COORDINATOR":
      return [
        {
          label: "Set up class groups",
          detail: "Assign advisers for this semester.",
          href: "/class-groups",
        },
        {
          label: "Review companies and MOAs",
          detail: "Verify host companies and their agreements.",
          href: "/companies",
        },
        {
          label: "Add company days off and events",
          detail: "Interns follow their host company's days off.",
          href: "/calendar",
        },
        {
          label: "Import students",
          detail: "Accounts for the semester's interns.",
          href: "/users/import",
        },
      ];
    default:
      return [
        {
          label: "Check the settings",
          detail: "Required hours, checklist, deductions, notices.",
          href: "/settings",
        },
        { label: "Manage accounts", detail: "Staff, students and imports.", href: "/users" },
        { label: "Set the semester", detail: "Dates and the active semester.", href: "/semesters" },
        {
          label: "Exports and data requests",
          detail: "Reports and privacy requests.",
          href: "/admin/export-center",
        },
      ];
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

export function GettingStarted({
  role,
  studentProfileId,
}: {
  role: string;
  studentProfileId?: string;
}) {
  const [hidden, setHidden] = useState(false);
  // Read the browser's choice without a render on the server (null = still unknown: hide).
  const dismissed = useSyncExternalStore(subscribeStorage, readDismissed, () => null);
  if (hidden || dismissed !== false) return null;

  function dismiss() {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Private mode: it just shows again next visit.
    }
    setHidden(true);
  }

  return (
    <section
      aria-labelledby="getting-started"
      className="relative rounded-xl border bg-card p-5 shadow-sm"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={dismiss}
        className="absolute top-2 right-2 cursor-pointer"
        aria-label="Hide getting started"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <h2 id="getting-started" className="text-base font-semibold text-foreground">
        Getting started
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The first things to do. Hide this when you are done.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stepsFor(role, studentProfileId).map((s, i) => (
          <li key={s.href + s.label}>
            <Link
              href={s.href}
              className="flex h-full gap-3 rounded-lg border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-4 text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={dismiss}
          className="cursor-pointer"
        >
          Done, hide this
        </Button>
      </div>
    </section>
  );
}

// Help page: bring the tour back.
export function ShowTourAgain() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={() => {
        try {
          localStorage.removeItem(TOUR_KEY);
        } catch {
          // Nothing stored, nothing to clear.
        }
        window.location.href = "/";
      }}
    >
      Show the getting-started steps again
    </Button>
  );
}
