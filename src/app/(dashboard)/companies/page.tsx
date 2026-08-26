import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Companies aren't sensitive on their own (only MOA records are, FR-MOA-07),
// so every role can browse this list.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { search?: string };
}) {
  await requireUserPage();
  const companies = await listCompanies({ search: searchParams.search });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Companies</h1>
        <Button asChild>
          <Link href="/companies/new">Register company</Link>
        </Button>
      </div>
      <form className="flex gap-2">
        <input
          type="search"
          name="search"
          placeholder="Search by name..."
          defaultValue={searchParams.search}
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
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
                <Link href={`/companies/${company.id}`} className="underline">
                  {company.name}
                </Link>
              </TableCell>
              <TableCell>{company.workModality}</TableCell>
              <TableCell>
                <Badge variant={company.isVerified ? "outline" : "secondary"}>
                  {company.isVerified ? "Verified" : "Unverified"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
