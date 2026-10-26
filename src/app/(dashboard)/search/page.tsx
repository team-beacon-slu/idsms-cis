import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { Search } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchEntries } from "@/lib/ai/search";

export const metadata: Metadata = { title: "Search entries" };

const STAFF: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// Job 6: search interns' daily entries by meaning ("networking", "nag-encode").
export default async function SearchEntriesPage(props: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUserPage();
  if (!STAFF.includes(user.role)) redirect("/");
  const q = ((await props.searchParams).q ?? "").slice(0, 200);
  let hits: Awaited<ReturnType<typeof searchEntries>> = [];
  let failed = false;
  try {
    hits = q ? await searchEntries(user, q) : await searchEntries(user, "");
  } catch {
    failed = true; // the connection failed; runJob counted it
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Search entries"
        description={
          user.role === Role.FACULTY_ADVISER
            ? "Find what your interns wrote by topic, in English or Taglish. Only your own interns' entries are searched."
            : "Find what interns wrote by topic, in English or Taglish."
        }
      />
      {hits === null ? (
        <p className="text-sm text-muted-foreground">
          Search by meaning is off right now (AI assist is switched off for you or for the
          department).
        </p>
      ) : (
        <>
          <form role="search" className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              Topic
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="e.g. networking, inventory, Canva"
              maxLength={200}
            />
            <Button type="submit" className="cursor-pointer gap-1.5">
              <Search className="size-4" aria-hidden="true" />
              Search
            </Button>
          </form>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              The search didn&apos;t complete. Try again in a moment.
            </p>
          )}
          {q && !failed && (
            <Card>
              <CardContent className="pt-6">
                {hits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No entries close to that topic.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {hits.map((h) => (
                      <li key={h.entryId} className="space-y-1 py-3">
                        <p className="text-sm">
                          <Link
                            href={
                              user.role === Role.FACULTY_ADVISER
                                ? `/students/${h.studentProfileId}/weekly-reports/${h.weeklyReportId}/review`
                                : `/students/${h.studentProfileId}/weekly-reports`
                            }
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {h.intern}
                          </Link>
                          <span className="text-muted-foreground"> · {h.date}</span>
                        </p>
                        <p className="text-sm text-foreground/85">{h.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
