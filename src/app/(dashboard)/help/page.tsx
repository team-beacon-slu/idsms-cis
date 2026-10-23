import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Help" };

type Faq = { q: string; a: React.ReactNode };

const STUDENT: Faq[] = [
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

const FACULTY: Faq[] = [
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

const COORDINATOR: Faq[] = [
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

const ADMIN: Faq[] = [
  {
    q: "Where are the department-wide rules?",
    a: "Settings holds the checklist requirements, required hours, notifications, deductions and AI options.",
  },
  {
    q: "Someone lost access to their account.",
    a: "On Users, Unlock a locked account, or use Force logout if a device was lost. A forgotten password is reset by the user from the sign-in page.",
  },
];

const EVERYONE: Faq[] = [
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

const GLOSSARY: { term: string; meaning: string }[] = [
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

const ROLE_FAQ: Record<Role, { title: string; items: Faq[] }[]> = {
  STUDENT_INTERN: [{ title: "Interns", items: STUDENT }],
  FACULTY_ADVISER: [{ title: "Faculty advisers", items: FACULTY }],
  DEPARTMENT_COORDINATOR: [{ title: "Coordinators", items: COORDINATOR }],
  SUPER_ADMIN: [
    { title: "Administrators", items: ADMIN },
    { title: "Coordinators", items: COORDINATOR },
  ],
};

type Contact = { label: string; name: string; email: string };

// Who to ask, from the real accounts: a student's own advisers and the coordinators;
// staff are pointed one level up.
async function contactsFor(userId: string, role: Role): Promise<Contact[]> {
  const people = (where: object) =>
    prisma.user.findMany({
      where: { ...where, isActive: true, deletedAt: null },
      select: { email: true, fullName: true },
      orderBy: { email: "asc" },
    });
  const toContact = (label: string) => (u: { email: string; fullName: string | null }) => ({
    label,
    name: u.fullName || u.email,
    email: u.email,
  });

  const out: Contact[] = [];
  if (role === Role.STUDENT_INTERN) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { classGroupId: true, semesterId: true },
    });
    if (profile) {
      const advisers = await prisma.facultyClassGroup.findMany({
        where: { classGroupId: profile.classGroupId, semesterId: profile.semesterId },
        select: { faculty: { select: { email: true, fullName: true } } },
      });
      out.push(...advisers.map((a) => toContact("Your faculty adviser")(a.faculty)));
    }
  }
  if (role !== Role.DEPARTMENT_COORDINATOR && role !== Role.SUPER_ADMIN) {
    out.push(
      ...(await people({ role: Role.DEPARTMENT_COORDINATOR })).map(
        toContact("Department coordinator")
      )
    );
  } else {
    out.push(...(await people({ role: Role.SUPER_ADMIN })).map(toContact("System administrator")));
  }
  return out;
}

function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-border">
      {items.map((f) => (
        <details key={f.q} className="group py-3 first:pt-0 last:pb-0">
          <summary className="cursor-pointer list-none py-1 text-sm font-medium text-foreground marker:hidden">
            <span
              className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90"
              aria-hidden="true"
            >
              ›
            </span>
            {f.q}
          </summary>
          <p className="mt-2 pl-5 text-sm leading-relaxed text-foreground/85">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export default async function HelpPage() {
  const user = await requireUserPage();
  const contacts = await contactsFor(user.id, user.role);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Help"
        description="Answers for your role, who to ask, and the words IDSMS uses."
      />

      <Card>
        <CardHeader>
          <CardTitle>Who to ask</CardTitle>
          <CardDescription>For anything this page doesn&apos;t answer.</CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts are set up yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li
                  key={`${c.label}-${c.email}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.label}</span>
                  </span>
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {c.email}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ROLE_FAQ[user.role].map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>For {section.title.toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent>
            <FaqList items={section.items} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>For everyone</CardTitle>
        </CardHeader>
        <CardContent>
          <FaqList items={EVERYONE} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Words IDSMS uses</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-brand-900">{g.term}</dt>
                <dd className="text-sm text-foreground/85">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
