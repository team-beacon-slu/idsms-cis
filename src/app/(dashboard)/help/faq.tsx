import Link from "next/link";
import type { Role } from "@prisma/client";

// The help content, shared by the Help page and the help assistant (job 9), which only
// ever points to one of these questions: it never writes an answer of its own.
export type Faq = { q: string; a: React.ReactNode };

export const STUDENT: Faq[] = [
  {
    q: "When is my weekly report due?",
    a: "The Next deadline tile on your dashboard shows the date and how many days are left. You also get a reminder before it.",
  },
  {
    q: "Why aren't my hours counted yet?",
    a: "Hours count as confirmed once your faculty adviser approves that week's report. Until then they show as pending.",
  },
  {
    q: "My weekly report was returned. What now?",
    a: "Open it from Weekly reports, read your adviser's comments, fix the entries and submit it again.",
  },
  {
    q: "Where do I hand in my requirements?",
    a: "Submit the documents in your Google Classroom. IDSMS only tracks whether each one was received and approved, on your Checklist.",
  },
  {
    q: "I'll be absent or my schedule changed.",
    a: (
      <>
        File it under{" "}
        <Link
          href="/leave-requests"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Leave &amp; time requests
        </Link>{" "}
        so your adviser can review it.
      </>
    ),
  },
  {
    q: "My name is wrong on my endorsement letter.",
    a: (
      <>
        Correct your legal name on{" "}
        <Link
          href="/profile#profile"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Account settings
        </Link>
        , then ask your adviser or coordinator to issue the letter again.
      </>
    ),
  },
];

export const FACULTY: Faq[] = [
  {
    q: "How do I review weekly reports?",
    a: "Your dashboard lists every report waiting for your review. Open one to approve it or return it with comments for the intern.",
  },
  {
    q: "How do I issue endorsement letters?",
    a: "On My students, use the bulk endorsement button for a class group. You confirm your password before the letters are made.",
  },
  {
    q: "An intern asked for leave or a schedule change.",
    a: "Your dashboard lists requests waiting for you. Open the intern's Leave & time requests to approve or decline it.",
  },
];

export const COORDINATOR: Faq[] = [
  {
    q: "What do I set up at the start of a semester?",
    a: "Activate the semester on Semesters, create class groups and assign their advisers on Class groups, then add students with Bulk import students on Users.",
  },
  {
    q: "How do I approve pre-deployment requirements?",
    a: "Open an intern's Checklist and mark each item approved once you have seen the document in Google Classroom.",
  },
  {
    q: "How do I get a report for the department?",
    a: "Use Export to Excel or Weekly summary on the dashboard; they follow the semester and program filters you chose.",
  },
];

export const ADMIN: Faq[] = [
  {
    q: "Where are the department-wide rules?",
    a: "Settings holds the checklist requirements, required hours, notifications, deductions and AI options.",
  },
  {
    q: "Someone lost access to their account.",
    a: "On Users, Unlock a locked account, or use Force logout if a device was lost. A forgotten password is reset by the user from the sign-in page.",
  },
];

export const EVERYONE: Faq[] = [
  {
    q: "What does AI assist do, and can I turn it off?",
    a: "It points advisers to what interns wrote: a day very similar to an earlier one, planned tasks not found in entries, a few of the intern's own sentences, and it asks interns about vague days before they submit. It never decides a grade, an approval or a deduction. Anyone can turn it off for themselves in the account menu or under Account settings.",
  },
  {
    q: "I forgot my password.",
    a: (
      <>
        Use{" "}
        <Link
          href="/auth/reset-password"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Forgot your password?
        </Link>{" "}
        on the sign-in page. The link in the email works once, for one hour.
      </>
    ),
  },
  {
    q: "Can I use it in dark mode or on my phone?",
    a: "Yes. Choose Light, Dark or Match device in the account menu (bottom of the sidebar), and IDSMS works on phone screens too.",
  },
  {
    q: "I signed in on a shared or lab computer.",
    a: "Sign out when you're done. If you forgot, use Sign out of other devices on Account settings.",
  },
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: "SIPP",
    meaning: "Student Internship Program in the Philippines, the CHED framework for internships.",
  },
  {
    term: "CMO No. 104, s. 2017",
    meaning: "The CHED memorandum order with the SIPP guidelines that SLU's internship follows.",
  },
  {
    term: "HTE",
    meaning: "Host Training Establishment: the company or office where you do your internship.",
  },
  { term: "MOA", meaning: "Memorandum of Agreement between SLU and the host company." },
  {
    term: "Endorsement letter",
    meaning:
      "SLU's letter introducing you to the host company, issued once your requirements are approved.",
  },
  {
    term: "Work plan",
    meaning: "Your planned tasks and schedule for the internship, approved by the coordinator.",
  },
  {
    term: "Confirmed hours",
    meaning:
      "Hours from weekly reports your adviser has approved; only these count toward your required hours.",
  },
  {
    term: "Deduction",
    meaning: "Hours subtracted under SLU's deduction matrix, for example for a conduct record.",
  },
];

export const ROLE_FAQ: Record<Role, { title: string; items: Faq[] }[]> = {
  STUDENT_INTERN: [{ title: "Interns", items: STUDENT }],
  FACULTY_ADVISER: [{ title: "Faculty advisers", items: FACULTY }],
  DEPARTMENT_COORDINATOR: [{ title: "Coordinators", items: COORDINATOR }],
  SUPER_ADMIN: [
    { title: "Administrators", items: ADMIN },
    { title: "Coordinators", items: COORDINATOR },
  ],
};

// The questions one person can be pointed to, in page order.
export function helpQuestionsFor(role: Role): string[] {
  return [...ROLE_FAQ[role].flatMap((s) => s.items), ...EVERYONE].map((f) => f.q);
}

export const faqId = (q: string) =>
  "faq-" +
  q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
