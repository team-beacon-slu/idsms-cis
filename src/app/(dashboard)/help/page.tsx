import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EVERYONE, GLOSSARY, ROLE_FAQ, faqId, type Faq } from "./faq";
import { HelpAsk } from "./help-ask";
import { connectionFor } from "@/lib/ai/jobs";

export const metadata: Metadata = { title: "Help" };

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
        <details key={f.q} id={faqId(f.q)} className="group scroll-mt-24 py-3 first:pt-0 last:pb-0">
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
  const [contacts, helpAi] = await Promise.all([
    contactsFor(user.id, user.role),
    connectionFor("help", user),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Help"
        description="Answers for your role, who to ask, and the words IDSMS uses."
      />

      {helpAi && <HelpAsk />}

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
