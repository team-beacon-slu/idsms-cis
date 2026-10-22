import Link from "next/link";
import { Search, Building2, ShieldCheck, Plus } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { listCompanies } from "@/lib/services/companyService";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatCard, StatStrip } from "@/components/stat-card";
import { cn } from "@/lib/utils";

function VerificationPill({ isVerified }: { isVerified: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        isVerified
          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400"
          : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300"
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", isVerified ? "bg-green-500" : "bg-slate-400")}
        aria-hidden="true"
      />
      {isVerified ? "Verified" : "Unverified"}
    </span>
  );
}

// Companies aren't sensitive on their own (only MOA records are, FR-MOA-07),
// so every role can browse this list.
export default async function CompaniesPage(props: { searchParams: Promise<{ search?: string }> }) {
  const searchParams = await props.searchParams;
  await requireUserPage();
  const companies = await listCompanies({ search: searchParams.search });
  const verifiedCount = companies.filter((c) => c.isVerified).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Companies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Host companies registered for student internships.
          </p>
        </div>
        <Button asChild className="cursor-pointer">
          <Link href="/companies/new" className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            Register company
          </Link>
        </Button>
      </div>

      <StatStrip>
        <StatCard label="Registered companies" value={companies.length} icon={Building2} />
        <StatCard label="Verified" value={verifiedCount} icon={ShieldCheck} />
      </StatStrip>

      <form className="flex gap-2">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="search"
            placeholder="Search by name..."
            defaultValue={searchParams.search}
            className="flex h-9 w-full rounded-md border border-input bg-card py-1 pr-3 pl-9 text-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
          />
        </div>
        <Button type="submit" variant="outline" className="cursor-pointer">
          Search
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableCaption className="sr-only">Registered companies</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <Link
                    href={`/companies/${company.id}`}
                    className="cursor-pointer font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline"
                  >
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{company.workModality}</TableCell>
                <TableCell>
                  <VerificationPill isVerified={company.isVerified} />
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">No companies found</p>
                    <p className="text-sm text-muted-foreground">
                      Register the first host company to get started.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
